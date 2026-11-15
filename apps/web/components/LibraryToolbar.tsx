"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Plus, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Equalizer } from "@/components/Brand";
import { uploadFileAction } from "@/lib/actions/library";
import type { ActionResult } from "@/lib/actions/types";
import { cn } from "@/lib/utils";
import { he } from "@/lib/strings";
import { mobileB2 } from "@/lib/mobile-strings-b2";

type FileStatus = "pending" | "uploading" | "done" | "error";

interface FileEntry {
  id: string;
  file: File;
  name: string;
  status: FileStatus;
  error?: string;
}

const ACCEPT =
  ".txt,.md,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const ALLOWED = /\.(txt|md|pdf|docx)$/i;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

/** Big drop zone. Files upload as soon as they are chosen or dropped. */
export function LibraryToolbar({ folderId }: { folderId?: string }) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showFab, setShowFab] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setShowFab(window.scrollY > 300);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const uploadSingleEntry = async (entry: FileEntry) => {
    if (entry.file.size > MAX_FILE_SIZE) {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id
            ? { ...e, status: "error", error: mobileB2.library.fileTooLarge }
            : e,
        ),
      );
      return;
    }

    setEntries((prev) =>
      prev.map((e) =>
        e.id === entry.id ? { ...e, status: "uploading", error: undefined } : e,
      ),
    );

    const formData = new FormData();
    // Send the filename as a plain UTF-8 string field BEFORE the file.
    formData.append("displayName", entry.file.name);
    if (folderId) formData.append("folderId", folderId);
    formData.append("file", entry.file);

    try {
      const result: ActionResult = await uploadFileAction({}, formData);
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id
            ? {
                ...e,
                status: result.success ? "done" : "error",
                error: result.error,
              }
            : e,
        ),
      );

      if (result.success) {
        setTimeout(() => {
          setEntries((prev) =>
            prev.filter((e) => e.id !== entry.id || e.status === "error"),
          );
        }, 2500);
      }
    } catch {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id
            ? { ...e, status: "error", error: "Upload failed" }
            : e,
        ),
      );
    }
  };

  const uploadAll = async (files: File[]) => {
    const accepted = files.filter((f) => ALLOWED.test(f.name));
    if (accepted.length === 0 || busy) return;

    const newEntries: FileEntry[] = accepted.map((f, idx) => {
      const isOverSize = f.size > MAX_FILE_SIZE;
      return {
        id: `${f.name}-${Date.now()}-${idx}-${Math.random()}`,
        file: f,
        name: f.name,
        status: isOverSize ? "error" : "pending",
        error: isOverSize ? mobileB2.library.fileTooLarge : undefined,
      };
    });

    setEntries((prev) => [...prev, ...newEntries]);
    if (inputRef.current) inputRef.current.value = "";

    setBusy(true);
    try {
      for (const entry of newEntries) {
        if (entry.status === "error") continue;
        await uploadSingleEntry(entry);
      }
    } finally {
      setBusy(false);
    }
  };

  const retryFile = async (entry: FileEntry) => {
    if (busy) return;
    setBusy(true);
    try {
      await uploadSingleEntry(entry);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void uploadAll(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "mt-2 rounded-[28px] border-[1.5px] border-dashed bg-card p-4 transition-colors sm:p-8",
          over && "border-primary bg-soft",
        )}
      >
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          {/* Phone compact header: short title + format chips */}
          <div className="flex w-full items-center justify-between gap-2 sm:hidden">
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              {mobileB2.library.shortTitle}
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {["PDF", "DOCX", "TXT", "MD"].map((t) => (
                <span
                  key={t}
                  className="num rounded-md bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Desktop header: big heading, subtitle, format chips */}
          <div className="hidden min-w-0 sm:block">
            <h2 className="text-balance text-[clamp(24px,4.4vw,34px)] font-extrabold leading-[1.15] tracking-tight">
              {he.library.dropTitleLine1}
              <br />
              {he.library.dropTitleLine2}
            </h2>
            <p className="mt-1.5 text-muted-foreground">{he.library.dropSubtitle}</p>
            <div className="mt-3.5 flex flex-wrap gap-1.5">
              {["PDF", "DOCX", "TXT", "MD"].map((t) => (
                <span
                  key={t}
                  className="num rounded-md bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Desktop Equalizer */}
          <Equalizer count={9} className="hidden h-[70px] gap-1 md:flex" barClassName="w-[5px]" />

          {/* Action button */}
          <div className="w-full sm:w-auto">
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              hidden
              onChange={(e) => void uploadAll(Array.from(e.target.files ?? []))}
            />
            <Button
              size="lg"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="w-full max-sm:h-[52px] max-sm:text-base font-semibold sm:w-auto"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
              <span className="sm:hidden">{mobileB2.library.chooseFiles}</span>
              <span className="hidden sm:inline">{he.library.chooseFiles}</span>
            </Button>
          </div>
        </div>

        {entries.length > 0 && (
          <ul className="mt-5 flex flex-col gap-2.5 border-t pt-4" aria-live="polite">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-col gap-1.5 rounded-xl bg-secondary/30 p-2 sm:bg-transparent sm:p-0"
              >
                <div className="flex items-center gap-2 text-sm">
                  {entry.status === "uploading" && (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                  )}
                  {entry.status === "done" && (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" />
                  )}
                  {entry.status === "error" && (
                    <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                  )}
                  {entry.status === "pending" && (
                    <span className="mx-1 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />
                  )}
                  <span
                    dir="auto"
                    className="min-w-0 flex-1 truncate font-medium text-foreground sm:text-muted-foreground"
                  >
                    {entry.name}
                  </span>
                  {entry.error && (
                    <span className="shrink-0 text-xs font-semibold text-destructive">
                      {entry.error}
                    </span>
                  )}
                  {entry.status === "error" && (
                    <button
                      type="button"
                      onClick={() => void retryFile(entry)}
                      disabled={busy}
                      aria-label={`${mobileB2.library.retry} ${entry.name}`}
                      className="inline-flex h-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-input bg-card px-3 text-xs font-semibold text-foreground hover:bg-secondary active:scale-95 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>{mobileB2.library.retry}</span>
                    </button>
                  )}
                </div>
                {entry.status === "uploading" && (
                  <div
                    className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
                    role="progressbar"
                    aria-label={he.library.uploading}
                  >
                    <div className="h-full w-full bg-primary animate-pulse" />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Floating Action Button on mobile after 300px scroll */}
      {showFab && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          aria-label={mobileB2.library.addDocument}
          className="fixed end-4 bottom-[calc(96px+env(safe-area-inset-bottom,0px))] z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
        >
          <Plus className="h-7 w-7" />
        </button>
      )}
    </>
  );
}
