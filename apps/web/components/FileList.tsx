"use client";

import Link from "next/link";
import { useRef, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  FileAudio,
  FileText,
  Loader2,
  Pencil,
  Play,
  RotateCcw,
  Share2,
  Trash2,
  Wand2,
} from "lucide-react";
import type { FileRecord, TtsProvider } from "@doc-to-audio/types";
import { Button } from "@/components/ui/button";
import {
  deleteFileAction,
  createJobAction,
  renameFileAction,
  moveFileAction,
} from "@/lib/actions/library";
import { he } from "@/lib/strings";

type FlatFolder = { id: string; name: string };

function StatusDot({ status }: { status: FileRecord["status"] }) {
  if (status === "DONE")
    return <span className="h-2 w-2 rounded-full bg-emerald-500" />;
  if (status === "PROCESSING")
    return <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />;
  if (status === "ERROR")
    return <span className="h-2 w-2 rounded-full bg-destructive" />;
  return <span className="h-2 w-2 rounded-full bg-amber-400" />;
}

function FileCard({
  file,
  allFolders,
  azureAvailable,
}: {
  file: FileRecord;
  allFolders: FlatFolder[];
  azureAvailable: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [provider, setProvider] = useState<TtsProvider>("gemini");
  const [reconstruct, setReconstruct] = useState(false);
  const [liveProgress, setLiveProgress] = useState(file.audioJob?.progress ?? 0);
  const [isCardStuck, setIsCardStuck] = useState(false);
  const lastProgressRef = useRef(file.audioJob?.progress ?? 0);
  const lastProgressAtRef = useRef(Date.now());
  const [copied, setCopied] = useState(false);

  const jobId = file.audioJob?.id;
  const isDone = file.status === "DONE" && jobId;
  const isBusy = (file.status === "PENDING" || file.status === "PROCESSING") && jobId;
  const isError = file.status === "ERROR";

  useEffect(() => {
    if (!isBusy || !jobId) return;
    const id = setInterval(async () => {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) return;
      const data = await res.json() as { progress?: number; status?: string };
      const newProg = data.progress ?? 0;
      setLiveProgress(newProg);
      if (newProg !== lastProgressRef.current) {
        lastProgressRef.current = newProg;
        lastProgressAtRef.current = Date.now();
        setIsCardStuck(false);
      } else if (Date.now() - lastProgressAtRef.current > 40_000) {
        setIsCardStuck(true);
      }
      if (data.status === "DONE" || data.status === "ERROR") {
        clearInterval(id);
        router.refresh();
      }
    }, 3000);
    return () => clearInterval(id);
  }, [isBusy, jobId, router]);

  const handleShare = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/share/${jobId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Rename
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(file.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setDraft(file.name);
    setIsEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };
  const commitRename = () => {
    const trimmed = draft.trim();
    setIsEditing(false);
    if (trimmed && trimmed !== file.name) {
      startTransition(async () => { await renameFileAction(file.id, trimmed); });
    }
  };
  const cancelEdit = () => { setIsEditing(false); setDraft(file.name); };

  const handleMove = (folderId: string) => {
    const target = folderId === "__root__" ? null : folderId;
    startTransition(async () => { await moveFileAction(file.id, target); });
  };

  const handleConvert = () => {
    startTransition(async () => { await createJobAction(file.id, provider, reconstruct); });
  };

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const isPdf = ext === "pdf";
  const isAudio = isDone;

  return (
    <div
      className={[
        "group relative flex flex-col rounded-xl border bg-card shadow-sm transition-all duration-200",
        "hover:shadow-md hover:-translate-y-0.5",
        isError ? "border-destructive/40 bg-destructive/5" : "",
        isBusy ? "border-blue-400/40" : "",
        isDone ? "border-emerald-400/50 shadow-emerald-100 dark:shadow-emerald-900/20" : "",
      ].join(" ")}
    >
      {/* Card body */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        {/* Icon + status row */}
        <div className="flex items-start justify-between">
          <div className="relative">
            <div
              className={[
                "flex h-10 w-10 items-center justify-center rounded-lg",
                isAudio
                  ? "bg-emerald-100 dark:bg-emerald-900/40"
                  : isPdf
                  ? "bg-red-100 dark:bg-red-900/40"
                  : "bg-blue-100 dark:bg-blue-900/40",
              ].join(" ")}
            >
              {isAudio ? (
                <FileAudio className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <FileText
                  className={[
                    "h-5 w-5",
                    isPdf
                      ? "text-red-600 dark:text-red-400"
                      : "text-blue-600 dark:text-blue-400",
                  ].join(" ")}
                />
              )}
            </div>
            {isDone && (
              <CheckCircle2 className="absolute -bottom-1 -end-1 h-4 w-4 rounded-full bg-card text-emerald-500" />
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <StatusDot status={file.status} />
            <span className="text-xs text-muted-foreground">{he.status[file.status]}</span>
          </div>
        </div>

        {/* File name */}
        {isEditing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") cancelEdit();
            }}
            dir="auto"
            className="w-full rounded border border-primary bg-background px-2 py-1 text-sm font-medium outline-none focus:ring-1 focus:ring-primary"
          />
        ) : (
          <p
            className="line-clamp-2 text-sm font-semibold leading-snug text-foreground"
            dir="auto"
            title={file.name}
          >
            {file.name}
          </p>
        )}

        {isDone && (
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">✓ מוכן לשמיעה</p>
        )}

        {isBusy && (
          <div className="space-y-1">
            {isCardStuck && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                {he.file.interrupted}
              </span>
            )}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={[
                  "h-full transition-all duration-500",
                  isCardStuck ? "bg-amber-400" : "bg-blue-500",
                ].join(" ")}
                style={{ width: `${liveProgress}%` }}
              />
            </div>
            <p className={[
              "text-end text-xs tabular-nums",
              isCardStuck ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400",
            ].join(" ")}>
              {liveProgress}%
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {new Date(file.createdAt).toLocaleDateString("he-IL")}
        </p>
      </div>

      {/* Card footer — actions */}
      <div className="flex items-center gap-1 border-t bg-muted/30 px-3 py-2">
        {isDone && jobId ? (
          <Button asChild size="sm" className="flex-1 gap-1.5">
            <Link href={`/player/${jobId}`}>
              <Play className="h-3.5 w-3.5" />
              {he.file.play}
            </Link>
          </Button>
        ) : isBusy && jobId ? (
          <div className="flex flex-1 items-center gap-1">
            <Button asChild size="sm" variant="outline" className="flex-1 gap-1.5">
              <Link href={`/player/${jobId}`}>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {he.file.view}
              </Link>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              title={he.file.restart}
              disabled={isPending}
              onClick={handleConvert}
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-1.5">
            {/* Provider row */}
            <div className="flex gap-1">
              {azureAvailable && (
                <select
                  aria-label={he.file.provider}
                  disabled={isPending}
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as TtsProvider)}
                  className="h-7 flex-1 cursor-pointer rounded border border-input bg-background px-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                >
                  <option value="gemini">{he.file.providerGemini}</option>
                  <option value="azure">{he.file.providerAzure}</option>
                </select>
              )}
            </div>
            {/* Multi-column reconstruction toggle */}
            <label
              className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"
              title={he.file.multiColumnHint}
            >
              <input
                type="checkbox"
                checked={reconstruct}
                disabled={isPending}
                onChange={(e) => setReconstruct(e.target.checked)}
                className="h-3.5 w-3.5 cursor-pointer rounded border-input accent-primary disabled:opacity-50"
              />
              {he.file.multiColumn}
            </label>
            <Button
              size="sm"
              className="w-full gap-1.5"
              disabled={isPending}
              onClick={handleConvert}
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isError ? (
                <RotateCcw className="h-3.5 w-3.5" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              {isError ? he.file.retry : he.file.convert}
            </Button>
          </div>
        )}

        {/* Secondary actions — always visible */}
        <div className="flex items-center gap-0.5">
          {isDone && jobId && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              aria-label={he.file.share}
              title={he.file.share}
              onClick={handleShare}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label={he.file.renameAriaLabel}
            disabled={isPending || isEditing}
            onClick={startEdit}
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>

          {allFolders.length > 0 && (
            <select
              aria-label={he.file.move}
              disabled={isPending}
              value={file.folderId ?? "__root__"}
              onChange={(e) => handleMove(e.target.value)}
              title={he.file.move}
              className="h-8 w-8 cursor-pointer appearance-none rounded border-0 bg-transparent text-center text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            >
              <option value="__root__">{he.file.moveRoot}</option>
              {allFolders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}

          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label={he.file.deleteFile}
            disabled={isPending}
            onClick={() => startTransition(async () => { await deleteFileAction(file.id); })}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function FileList({
  files,
  allFolders,
  azureAvailable = false,
}: {
  files: FileRecord[];
  allFolders: FlatFolder[];
  azureAvailable?: boolean;
}) {
  if (files.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        {he.library.noFilesHere}
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {files.map((file) => (
        <FileCard
          key={file.id}
          file={file}
          allFolders={allFolders}
          azureAvailable={azureAvailable}
        />
      ))}
    </div>
  );
}
