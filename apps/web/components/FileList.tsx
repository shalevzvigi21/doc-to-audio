"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
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
import { deleteFileAction, moveFileAction, queueFileAction, renameFileAction } from "@/lib/actions/library";
import { usePlayer } from "@/components/player/context";
import { cn, formatClock, relativeDate } from "@/lib/utils";
import { he } from "@/lib/strings";

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
      } else if (Date.now() - lastProgressAtRef.current > 40_000) {
        setIsStuck(true);
      }
      if (data.status === "DONE" || data.status === "ERROR") {
        clearInterval(id);
        router.refresh();
      }
    }, 3000);
    return () => clearInterval(id);
  }, [isBusy, jobId, router]);

  // Convert drawer
  const [drawer, setDrawer] = useState(false);
  const [provider, setProvider] = useState<TtsProvider>("gemini");
  const [reconstruct, setReconstruct] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const startConvert = () => {
    setActionError(null);
    startTransition(async () => {
      const r = await queueFileAction(file.id, provider, reconstruct);
      if (r.error) setActionError(r.error);
      else {
        setDrawer(false);
        router.refresh();
      }
    });
  };

  // Menu
  const [menu, setMenu] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") setMenu(false);
        return;
      }
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      setConfirmDel(false);
    };
  }, [menu]);

  // Rename
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(file.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const startEdit = () => {
    setMenu(false);
    setDraft(file.name);
    setIsEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
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
  });
  const togglePlay = () => player.load(track(), { autoplay: true });
  const openPlayer = () => {
    player.load(track(), { autoplay: !isCurrent });
    player.openSheet();
  };

  const showResume = isDone && duration > 0 && position > 0 && position < duration - 2;

  return (
    <article
      className={cn(
        "relative rounded-[20px] border bg-card transition-[border-color,box-shadow] hover:border-foreground/25",
        isCurrent && "border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.16)] hover:border-primary",
      )}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2.5 p-2.5 sm:gap-3.5 sm:p-3">
        {/* File tile (with progress ring while converting) */}
        <div
          className={cn(
            "num relative grid h-10 w-10 place-items-center rounded-[14px] text-[11px] tracking-wide sm:h-[46px] sm:w-[46px]",
            isDone ? "bg-soft text-primary" : isError ? "bg-destructive/15 text-destructive" : "bg-secondary text-muted-foreground",
          )}
        >
          {isBusy && <span className="ring-progress" style={{ ["--p" as string]: liveProgress }} />}
          {ext}
        </div>

        {/* Title + meta */}
        <div className="min-w-0">
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
            <button type="button" onClick={openPlayer} dir="auto" title={file.name} className="block max-w-full truncate text-start font-medium hover:underline">
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

        {/* Primary action */}
        {isDone ? (
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? he.audio.pause : he.audio.play}
            className={cn(
              "grid h-[46px] w-[46px] place-items-center rounded-full transition hover:scale-105",
              isPlaying ? "bg-primary text-primary-foreground" : "bg-foreground text-background",
            )}
          >
            {isPlaying ? <Pause className="h-[18px] w-[18px] fill-current" /> : <Play className="h-[18px] w-[18px] translate-x-px fill-current" />}
          </button>
        ) : isBusy ? (
          <Button asChild size="sm" variant="secondary">
            <Link href={`/player/${jobId}`}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {he.file.view}
            </Link>
          </Button>
        ) : (
          <Button size="sm" onClick={() => setDrawer((v) => !v)} aria-expanded={drawer}>
            {isError ? <RotateCcw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {isError ? he.file.retry : he.file.convert}
          </Button>
        )}

        {/* Menu */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenu((v) => !v)}
            aria-label={he.file.moreActions}
            aria-haspopup="menu"
            aria-expanded={menu}
            disabled={isPending}
            className="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50 max-sm:-me-1.5"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {menu && (
            <div role="menu" className="absolute end-0 top-full z-40 mt-1.5 min-w-[210px] rounded-2xl border bg-popover p-1.5 shadow-xl">
              <MenuItem icon={<Pencil className="h-4 w-4" />} onClick={startEdit}>
                {he.file.rename}
              </MenuItem>
              {isDone && (
                <MenuItem icon={<Share2 className="h-4 w-4" />} onClick={share}>
                  {he.file.share}
                </MenuItem>
              )}
              {isBusy && (
                <MenuItem
                  icon={<RotateCcw className="h-4 w-4" />}
                  onClick={() => {
                    setMenu(false);
                    startTransition(async () => {
                      await queueFileAction(file.id);
                      router.refresh();
                    });
                  }}
                >
                  {he.file.restart}
                </MenuItem>
              )}
              {allFolders.length > 0 && (
                <>
                  <div className="my-1.5 h-px bg-border" />
                  <div className="px-3 pb-0.5 pt-1.5 text-[11px] text-muted-foreground">{he.file.moveTo}</div>
                  <MenuItem
                    icon={<Folder className="h-4 w-4" />}
                    active={!file.folderId}
                    onClick={() => {
                      setMenu(false);
                      startTransition(async () => {
                        await moveFileAction(file.id, null);
                      });
                    }}
                  >
                    {he.file.moveRoot}
                  </MenuItem>
                  {allFolders.map((f) => (
                    <MenuItem
                      key={f.id}
                      icon={<Folder className="h-4 w-4" />}
                      active={file.folderId === f.id}
                      onClick={() => {
                        setMenu(false);
                        startTransition(async () => {
                          await moveFileAction(file.id, f.id);
                        });
                      }}
                    >
                      <span dir="auto">{f.name}</span>
                    </MenuItem>
                  ))}
                </>
              )}
              <div className="my-1.5 h-px bg-border" />
              <MenuItem
                danger
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => {
                  if (!confirmDel) {
                    setConfirmDel(true);
                    return;
                  }
                  setMenu(false);
                  startTransition(async () => {
                    await deleteFileAction(file.id);
                  });
                }}
              >
                {confirmDel ? he.file.deleteConfirm : he.file.deleteFile}
              </MenuItem>
            </div>
          )}
        </div>
      </div>

      {/* Convert drawer */}
      {drawer && !isDone && !isBusy && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4 border-t px-4 pb-4 pt-3.5">
          <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            {he.file.engine}
            <div role="group" className="inline-flex rounded-xl bg-secondary p-[3px]">
              {(["gemini", "azure"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={provider === p}
                  disabled={isPending || (p === "azure" && !azureAvailable)}
                  title={p === "azure" && !azureAvailable ? he.tts.azureUnavailable : undefined}
                  onClick={() => setProvider(p)}
                  className={cn(
                    "rounded-[9px] px-4 py-1.5 text-sm text-muted-foreground transition disabled:cursor-not-allowed disabled:opacity-40",
                    provider === p && "bg-card text-foreground shadow-sm",
                  )}
                >
                  {p === "gemini" ? he.file.providerGemini : he.file.providerAzure}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            {he.file.twoColumns}
            <button
              type="button"
              role="switch"
              aria-checked={reconstruct}
              disabled={isPending}
              title={he.file.multiColumnHint}
              onClick={() => setReconstruct((v) => !v)}
              className="inline-flex items-center gap-2.5 text-sm text-foreground"
            >
              <span className={cn("relative h-6 w-10 rounded-full transition", reconstruct ? "bg-primary" : "bg-secondary")}>
                <span
                  className={cn(
                    "absolute top-[3px] h-[18px] w-[18px] rounded-full transition-all",
                    reconstruct ? "bg-white start-[19px]" : "bg-muted-foreground start-[3px]",
                  )}
                />
              </span>
              {he.file.multiColumn}
            </button>
          </div>

          <div className="flex flex-col items-start gap-1 max-sm:w-full sm:ms-auto">
            <Button onClick={startConvert} disabled={isPending} className="max-sm:w-full">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {he.file.startConvert}
            </Button>
            {actionError && (
              <p role="alert" className="text-xs text-destructive">
                {actionError}
              </p>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function MenuItem({
  icon,
  children,
  onClick,
  danger,
  active,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-start text-sm hover:bg-secondary",
        danger && "text-destructive",
        active && "font-semibold",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {active && <span aria-hidden="true">✓</span>}
    </button>
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
        <FileRow key={item.file.id} item={item} allFolders={allFolders} azureAvailable={azureAvailable} />
      ))}
    </div>
  );
}
