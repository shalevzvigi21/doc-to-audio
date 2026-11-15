"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownToLine,
  CloudOff,
  Folder,
  Loader2,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Share2,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { FileRecord, TtsProvider } from "@doc-to-audio/types";
import { Button } from "@/components/ui/button";
import { Sheet, SheetAction } from "@/components/ui/sheet";
import { deleteFileAction, moveFileAction, queueFileAction, renameFileAction } from "@/lib/actions/library";
import { usePlayer } from "@/components/player/context";
import { openOpenAISetup } from "@/components/OpenAISetup";
import { ImportantToKnow } from "@/components/ImportantToKnow";
import { OpenAIVoicePicker, useOpenAIChoice } from "@/components/OpenAIVoicePicker";
import { downloadForOffline, isOffline, offlineSupported, removeOffline } from "@/lib/offline";
import { cn, formatClock, relativeDate } from "@/lib/utils";
import { he } from "@/lib/strings";
import { mobileA } from "@/lib/mobile-strings-a";

type FlatFolder = { id: string; name: string };

export interface LibraryItem {
  file: FileRecord;
  folderName: string | null;
}

const KNOWN_EXT = /\.(pdf|docx|txt|md)$/i;

function Pill({ tone, children }: { tone: "busy" | "wait" | "bad"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        "before:h-1.5 before:w-1.5 before:rounded-full before:bg-current before:content-['']",
        tone === "busy" && "bg-soft text-primary before:animate-pulse",
        tone === "wait" && "bg-warn/15 text-warn",
        tone === "bad" && "bg-destructive/10 text-destructive",
      )}
    >
      {children}
    </span>
  );
}

function Dot() {
  return <span className="h-[3px] w-[3px] rounded-full bg-muted-foreground/60" />;
}

function FileRow({
  item,
  allFolders,
  azureAvailable,
}: {
  item: LibraryItem;
  allFolders: FlatFolder[];
  azureAvailable: boolean;
}) {
  const { file, folderName } = item;
  const router = useRouter();
  const player = usePlayer();
  const [isPending, startTransition] = useTransition();

  const jobId = file.audioJob?.id;
  const isDone = file.status === "DONE" && Boolean(jobId);
  const isBusy = (file.status === "PENDING" || file.status === "PROCESSING") && Boolean(jobId);
  const isWaiting = file.status === "PENDING" && !jobId;
  const isError = file.status === "ERROR";

  // Live progress + stuck detection while a conversion runs.
  const [liveProgress, setLiveProgress] = useState(file.audioJob?.progress ?? 0);
  const [isStuck, setIsStuck] = useState(false);
  const lastProgressRef = useRef(file.audioJob?.progress ?? 0);
  const lastProgressAtRef = useRef(Date.now());

  useEffect(() => {
    if (!isBusy || !jobId) return;
    const id = setInterval(async () => {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) return;
      const data = (await res.json()) as { progress?: number; status?: string };
      const next = data.progress ?? 0;
      setLiveProgress(next);
      if (next !== lastProgressRef.current) {
        lastProgressRef.current = next;
        lastProgressAtRef.current = Date.now();
        setIsStuck(false);
      } else if (Date.now() - lastProgressAtRef.current > 180_000) {
        setIsStuck(true);
      }
      if (data.status === "DONE" || data.status === "ERROR") {
        clearInterval(id);
        router.refresh();
      }
    }, 3000);
    return () => clearInterval(id);
  }, [isBusy, jobId, router]);

  // Offline listening support
  const [offlineAvail, setOfflineAvail] = useState(false);
  const [isOfflineSaved, setIsOfflineSaved] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [offlineError, setOfflineError] = useState<string | null>(null);

  useEffect(() => {
    if (!offlineSupported()) return;
    setOfflineAvail(true);
    if (!isDone || !jobId) return;

    let active = true;
    isOffline(jobId)
      .then((saved) => {
        if (active) setIsOfflineSaved(saved);
      })
      .catch(() => {
        // ignore error silently
      });

    return () => {
      active = false;
    };
  }, [isDone, jobId]);

  const handleDownloadOffline = async () => {
    if (!jobId) return;
    setOfflineError(null);
    setIsDownloading(true);
    setDownloadProgress(0);
    try {
      await downloadForOffline(
        { id: jobId, name: file.name, duration: file.audioJob?.duration },
        (fraction) => {
          setDownloadProgress(fraction >= 0 ? Math.round(fraction * 100) : -1);
        },
      );
      const saved = await isOffline(jobId);
      setIsOfflineSaved(saved);
    } catch {
      setOfflineError(mobileA.downloadFailed);
    } finally {
      setIsDownloading(false);
      setDownloadProgress(null);
    }
  };

  const handleRemoveOffline = async () => {
    if (!jobId) return;
    setOfflineError(null);
    try {
      await removeOffline(jobId);
      const saved = await isOffline(jobId);
      setIsOfflineSaved(saved);
    } catch {
      setOfflineError(mobileA.removeFailed);
    }
  };

  // Convert sheet
  const [drawer, setDrawer] = useState(false);
  // OpenAI is the default engine.
  const [provider, setProvider] = useState<TtsProvider>("openai");
  const [openaiChoice, setOpenaiChoice] = useOpenAIChoice();
  const [reconstruct, setReconstruct] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const startConvert = () => {
    setActionError(null);
    startTransition(async () => {
      const r = await queueFileAction(file.id, provider, reconstruct, openaiChoice);
      if (r.code === "OPENAI_KEY_MISSING") {
        setActionError(he.openaiKey.missingShort);
        openOpenAISetup();
      } else if (r.error) setActionError(r.error);
      else {
        setDrawer(false);
        router.refresh();
      }
    });
  };

  // Menu action sheet
  const [menu, setMenu] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  // Rename
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(file.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const startEdit = () => {
    setMenu(false);
    setConfirmDel(false);
    setDraft(file.name);
    setIsEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
  };
  const commitRename = () => {
    const trimmed = draft.trim();
    setIsEditing(false);
    if (trimmed && trimmed !== file.name) {
      startTransition(async () => {
        await renameFileAction(file.id, trimmed);
      });
    }
  };

  const [copied, setCopied] = useState(false);
  const share = async () => {
    setMenu(false);
    setConfirmDel(false);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/share/${jobId}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  const ext = file.name.match(KNOWN_EXT)?.[1]?.toUpperCase() ?? file.name.split(".").pop()?.slice(0, 4).toUpperCase() ?? "FILE";
  const displayName = file.name.replace(KNOWN_EXT, "");

  // Playback
  const isCurrent = Boolean(jobId) && player.track?.id === jobId;
  const isPlaying = isCurrent && player.playing;
  const duration = (isCurrent && player.total > 0 ? player.total : file.audioJob?.duration) ?? 0;
  const position = isCurrent ? player.current : (file.audioJob?.lastPosition ?? 0);
  const subtitle = [ext, folderName].filter(Boolean).join(" · ");

  const track = () => ({
    id: jobId as string,
    name: displayName,
    src: `/api/audio/${jobId}`,
    duration: file.audioJob?.duration ?? null,
    position: file.audioJob?.lastPosition ?? 0,
    persist: true,
    subtitle,
    doc: { fileId: file.id, mimeType: file.mimeType, name: file.name },
  });
  const togglePlay = () => player.load(track(), { autoplay: true });
  const openPlayer = () => {
    player.load(track(), { autoplay: !isCurrent });
    player.openSheet();
  };

  const showResume = isDone && duration > 0 && position > 0 && position < duration - 2;

  return (
    <article
      onClick={(e) => {
        if (!isDone || isEditing) return;
        if ((e.target as HTMLElement).closest("button, a, input, select, textarea, [role='switch']")) {
          return;
        }
        openPlayer();
      }}
      className={cn(
        "relative min-h-[64px] rounded-[20px] border bg-card transition-[border-color,box-shadow,background-color] hover:border-foreground/25",
        isCurrent && "border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.16)] hover:border-primary",
        isDone && !isEditing && "cursor-pointer active:bg-secondary/40",
      )}
    >
      <div className="grid min-h-[64px] grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2.5 p-2.5 sm:gap-3.5 sm:p-3">
        {/* File tile (with progress ring while converting) */}
        <div
          className={cn(
            "num relative grid h-10 w-10 shrink-0 place-items-center rounded-[14px] text-[11px] tracking-wide sm:h-[46px] sm:w-[46px]",
            isDone ? "bg-soft text-primary" : isError ? "bg-destructive/15 text-destructive" : "bg-secondary text-muted-foreground",
          )}
        >
          {isBusy && <span className="ring-progress" style={{ ["--p" as string]: liveProgress }} />}
          {ext}
        </div>

        {/* Title + meta (takes full width) */}
        <div className="min-w-0 w-full flex-1">
          {isEditing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setIsEditing(false);
                  setDraft(file.name);
                }
              }}
              dir="auto"
              aria-label={he.file.renameAriaLabel}
              className="h-9 w-full rounded-[10px] border border-primary bg-background px-2.5 text-sm font-medium outline-none"
            />
          ) : isDone ? (
            <button
              type="button"
              onClick={openPlayer}
              dir="auto"
              title={file.name}
              className="block w-full max-w-full truncate text-start font-medium hover:underline"
            >
              {displayName}
            </button>
          ) : (
            <div dir="auto" title={file.name} className="truncate font-medium">
              {displayName}
            </div>
          )}
          <div className="mt-px flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            {isBusy && (
              <Pill tone="busy">
                {he.status.PROCESSING} <span className="num">{Math.round(liveProgress)}%</span>
              </Pill>
            )}
            {isStuck && isBusy && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warn/15 px-2 py-0.5 text-xs font-medium text-warn">
                <AlertTriangle className="h-3 w-3" />
                {he.file.interrupted}
              </span>
            )}
            {isWaiting && <Pill tone="wait">{he.file.waiting}</Pill>}
            {isError && <Pill tone="bad">{he.file.failed}</Pill>}
            {isDone && duration > 0 && (
              <>
                <span className="num">{formatClock(duration)}</span>
                <Dot />
              </>
            )}
            {folderName && (
              <>
                <span dir="auto">{folderName}</span>
                <Dot />
              </>
            )}
            <span>{relativeDate(file.createdAt)}</span>
            {isOfflineSaved && (
              <>
                <Dot />
                <span
                  className="inline-flex items-center gap-1 text-ok"
                  title={mobileA.offlineBadge}
                  aria-label={mobileA.offlineBadge}
                >
                  <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="text-xs">{mobileA.offlineBadge}</span>
                </span>
              </>
            )}
            {copied && (
              <>
                <Dot />
                <span className="text-ok">{he.file.shareCopiedShort}</span>
              </>
            )}
          </div>
          {showResume && (
            <div className="mt-2 h-[3px] max-w-[220px] overflow-hidden rounded-full bg-secondary" title={he.file.resumeHint}>
              <div className="h-full rounded-full bg-primary" style={{ width: `${(position / duration) * 100}%` }} />
            </div>
          )}
        </div>

        {/* Primary action (stays on end side) */}
        {isDone ? (
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? he.audio.pause : he.audio.play}
            className={cn(
              "grid h-[46px] w-[46px] place-items-center rounded-full transition active:scale-95 hover:scale-105",
              isPlaying ? "bg-primary text-primary-foreground" : "bg-foreground text-background",
            )}
          >
            {isPlaying ? (
              <Pause className="h-[18px] w-[18px] fill-current" />
            ) : (
              <Play className="h-[18px] w-[18px] translate-x-px fill-current" />
            )}
          </button>
        ) : isBusy ? (
          <Button asChild size="sm" variant="secondary">
            <Link href={`/player/${jobId}`}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {he.file.view}
            </Link>
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => setDrawer(true)}
            aria-expanded={drawer}
          >
            {isError ? <RotateCcw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {isError ? he.file.retry : he.file.convert}
          </Button>
        )}

        {/* Kebab action button (44x44) */}
        <button
          type="button"
          onClick={() => setMenu(true)}
          aria-label={he.file.moreActions}
          aria-haspopup="dialog"
          aria-expanded={menu}
          disabled={isPending}
          className="grid h-11 w-11 place-items-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground active:scale-95 disabled:opacity-50"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </div>

      {/* Action sheet (replaces popover menu at all screen sizes) */}
      <Sheet
        open={menu}
        onClose={() => {
          setMenu(false);
          setConfirmDel(false);
        }}
        title={file.name}
      >
        <div className="flex flex-col gap-1 py-2">
          {/* Rename */}
          <SheetAction
            icon={<Pencil className="h-5 w-5" />}
            onClick={startEdit}
          >
            {he.file.rename}
          </SheetAction>

          {/* Share (DONE only) */}
          {isDone && (
            <SheetAction
              icon={<Share2 className="h-5 w-5" />}
              onClick={share}
            >
              {he.file.share}
            </SheetAction>
          )}

          {/* Offline listening download (DONE only, offlineSupported only) */}
          {isDone && offlineAvail && (
            <SheetAction
              icon={
                isDownloading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : isOfflineSaved ? (
                  <CloudOff className="h-5 w-5" />
                ) : (
                  <ArrowDownToLine className="h-5 w-5" />
                )
              }
              disabled={isDownloading}
              onClick={isOfflineSaved ? handleRemoveOffline : handleDownloadOffline}
            >
              <div className="flex flex-col items-start min-w-0">
                <span className="truncate">
                  {isDownloading
                    ? downloadProgress !== null && downloadProgress >= 0
                      ? mobileA.downloadingPercent(downloadProgress)
                      : mobileA.downloading
                    : isOfflineSaved
                      ? mobileA.removeOffline
                      : mobileA.downloadOffline}
                </span>
                {offlineError && (
                  <span className="text-xs font-normal text-destructive">{offlineError}</span>
                )}
              </div>
            </SheetAction>
          )}

          {/* Restart (busy only) */}
          {isBusy && (
            <SheetAction
              icon={<RotateCcw className="h-5 w-5" />}
              onClick={() => {
                setMenu(false);
                setConfirmDel(false);
                startTransition(async () => {
                  await queueFileAction(file.id);
                  router.refresh();
                });
              }}
            >
              {he.file.restart}
            </SheetAction>
          )}

          {/* Move to folder group */}
          {allFolders.length > 0 && (
            <>
              <div className="my-2 h-px bg-border" />
              <div className="px-4 pb-1 pt-1 text-xs font-medium text-muted-foreground">
                {he.file.moveTo}
              </div>
              <SheetAction
                icon={<Folder className="h-5 w-5" />}
                selected={!file.folderId}
                onClick={() => {
                  setMenu(false);
                  setConfirmDel(false);
                  startTransition(async () => {
                    await moveFileAction(file.id, null);
                  });
                }}
              >
                {he.file.moveRoot}
              </SheetAction>
              {allFolders.map((f) => (
                <SheetAction
                  key={f.id}
                  icon={<Folder className="h-5 w-5" />}
                  selected={file.folderId === f.id}
                  onClick={() => {
                    setMenu(false);
                    setConfirmDel(false);
                    startTransition(async () => {
                      await moveFileAction(file.id, f.id);
                    });
                  }}
                >
                  <span dir="auto">{f.name}</span>
                </SheetAction>
              ))}
            </>
          )}

          {/* Delete (danger, 2-tap confirmation) */}
          <div className="my-2 h-px bg-border" />
          <SheetAction
            danger
            icon={<Trash2 className="h-5 w-5" />}
            onClick={() => {
              if (!confirmDel) {
                setConfirmDel(true);
                return;
              }
              setMenu(false);
              setConfirmDel(false);
              startTransition(async () => {
                await deleteFileAction(file.id);
              });
            }}
          >
            {confirmDel ? he.file.deleteConfirm : he.file.deleteFile}
          </SheetAction>
        </div>
      </Sheet>

      {/* Convert sheet (replaces inline convert drawer) */}
      <Sheet
        open={drawer}
        onClose={() => setDrawer(false)}
        title={he.file.convert}
      >
        <div className="flex flex-col gap-5 py-3">
          {/* Engine segmented control */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">{he.file.engine}</span>
            <div role="group" className="grid grid-cols-3 rounded-2xl bg-secondary p-1">
              {(["gemini", "openai", "azure"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={provider === p}
                  disabled={isPending || (p === "azure" && !azureAvailable)}
                  title={p === "azure" && !azureAvailable ? he.tts.azureUnavailable : undefined}
                  onClick={() => setProvider(p)}
                  className={cn(
                    "h-11 rounded-xl text-sm font-medium text-muted-foreground transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40",
                    provider === p && "bg-card font-semibold text-foreground shadow-sm",
                  )}
                >
                  {p === "gemini"
                    ? he.file.providerGemini
                    : p === "openai"
                      ? he.file.providerOpenAI
                      : he.file.providerAzure}
                </button>
              ))}
            </div>
          </div>

          {/* OpenAI voice picker when openai is selected */}
          {provider === "openai" && (
            <OpenAIVoicePicker
              value={openaiChoice}
              onChange={setOpenaiChoice}
              disabled={isPending}
            />
          )}

          {/* Multi-column layout switch */}
          <div className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">{he.file.twoColumns}</span>
                <span className="text-xs text-muted-foreground">{he.file.multiColumnHint}</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={reconstruct}
                disabled={isPending}
                title={he.file.multiColumnHint}
                onClick={() => setReconstruct((v) => !v)}
                className="inline-flex items-center gap-2.5 text-sm text-foreground transition active:scale-95"
              >
                <span
                  className={cn(
                    "relative h-6 w-10 rounded-full transition",
                    reconstruct ? "bg-primary" : "bg-secondary",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-[3px] h-[18px] w-[18px] rounded-full transition-all",
                      reconstruct ? "bg-white start-[19px]" : "bg-muted-foreground start-[3px]",
                    )}
                  />
                </span>
                <span className="sr-only">{he.file.multiColumn}</span>
              </button>
            </div>
            <details className="mt-1 text-xs">
              <summary className="cursor-pointer select-none text-primary hover:underline">
                {he.file.multiColumnHelpTitle}
              </summary>
              <div className="mt-2 space-y-1.5 leading-relaxed text-muted-foreground">
                <p className="font-medium text-foreground">{he.file.multiColumnHelpOn}</p>
                <ul className="list-disc space-y-0.5 ps-4">
                  {he.file.multiColumnHelpOnItems.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                <p>{he.file.multiColumnHelpOff}</p>
                <p>{he.file.multiColumnHelpWhy}</p>
                <p className="font-medium text-warn">{he.file.multiColumnHelpCost}</p>
              </div>
            </details>
          </div>

          {/* Important to know panel */}
          <ImportantToKnow />

          {/* Bottom 52px primary Convert button */}
          <div className="pt-2">
            <Button
              type="button"
              onClick={startConvert}
              disabled={isPending}
              className="h-[52px] w-full text-base font-semibold"
            >
              {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
              {he.file.startConvert}
            </Button>
            {actionError && (
              <p role="alert" className="mt-2 text-center text-sm font-medium text-destructive">
                {actionError}
              </p>
            )}
          </div>
        </div>
      </Sheet>
    </article>
  );
}

export function FileList({
  items,
  allFolders,
  azureAvailable = false,
}: {
  items: LibraryItem[];
  allFolders: FlatFolder[];
  azureAvailable?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="mt-3.5 rounded-[20px] border border-dashed p-14 text-center text-muted-foreground">
        <b className="block text-foreground">{he.library.emptyTitle}</b>
        {he.library.emptyDescription}
      </div>
    );
  }
  return (
    <div className="mt-3.5 flex flex-col gap-2">
      {items.map((item) => (
        <FileRow
          key={item.file.id}
          item={item}
          allFolders={allFolders}
          azureAvailable={azureAvailable}
        />
      ))}
    </div>
  );
}
