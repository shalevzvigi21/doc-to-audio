"use client";

import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Equalizer } from "@/components/Brand";
import { uploadFileAction } from "@/lib/actions/library";
import type { ActionResult } from "@/lib/actions/types";
import { cn } from "@/lib/utils";
import { he } from "@/lib/strings";

type FileStatus = "uploading" | "done" | "error";

interface FileEntry {
  name: string;
  status: FileStatus;
  error?: string;
}

const ACCEPT =
  ".txt,.md,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const ALLOWED = /\.(txt|md|pdf|docx)$/i;

/** Big drop zone. Files upload as soon as they are chosen or dropped. */
export function LibraryToolbar({ folderId }: { folderId?: string }) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadAll = async (files: File[]) => {
    const accepted = files.filter((f) => ALLOWED.test(f.name));
    if (accepted.length === 0 || busy) return;
    setBusy(true);
    setEntries(accepted.map((f) => ({ name: f.name, status: "uploading" as FileStatus })));

    for (let i = 0; i < accepted.length; i++) {
      const formData = new FormData();
      // Send the filename as a plain UTF-8 string field BEFORE the file.
      // Browsers reliably encode string fields as UTF-8; Content-Disposition
      // filename encoding is inconsistent for non-ASCII (Hebrew) characters.
      formData.append("displayName", accepted[i].name);
      if (folderId) formData.append("folderId", folderId);
      formData.append("file", accepted[i]);

      const result: ActionResult = await uploadFileAction({}, formData);
      setEntries((prev) =>
        prev.map((e, idx) =>
          idx === i ? { ...e, status: result.success ? "done" : "error", error: result.error } : e,
        ),
      );
    }

    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    setTimeout(() => setEntries((prev) => prev.filter((e) => e.status === "error")), 2500);
  };

  return (
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
        "mt-2 rounded-[28px] border-[1.5px] border-dashed bg-card p-5 transition-colors sm:p-8",
        over && "border-primary bg-soft",
      )}
    >
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-balance text-[clamp(24px,4.4vw,34px)] font-extrabold leading-[1.15] tracking-tight">
            {he.library.dropTitleLine1}
            <br />
            {he.library.dropTitleLine2}
          </h2>
          <p className="mt-1.5 text-muted-foreground">{he.library.dropSubtitle}</p>
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {["PDF", "DOCX", "TXT", "MD"].map((t) => (
              <span key={t} className="num rounded-md bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        </div>
        <Equalizer count={9} className="hidden h-[70px] gap-1 md:flex" barClassName="w-[5px]" />
        <div className="max-sm:w-full">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            hidden
            onChange={(e) => void uploadAll(Array.from(e.target.files ?? []))}
          />
          <Button size="lg" disabled={busy} onClick={() => inputRef.current?.click()} className="max-sm:w-full">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
            {he.library.chooseFiles}
          </Button>
        </div>
      </div>

      {entries.length > 0 && (
        <ul className="mt-5 flex flex-col gap-1.5 border-t pt-4" aria-live="polite">
          {entries.map((entry, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              {entry.status === "uploading" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
              {entry.status === "done" && <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" />}
              {entry.status === "error" && <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />}
              <span dir="auto" className="min-w-0 flex-1 truncate text-muted-foreground">
                {entry.name}
              </span>
              {entry.error && <span className="shrink-0 text-xs text-destructive">{entry.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
