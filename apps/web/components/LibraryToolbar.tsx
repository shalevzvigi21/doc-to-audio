"use client";

import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadFileAction } from "@/lib/actions/library";
import type { ActionResult } from "@/lib/actions/types";
import { he } from "@/lib/strings";

type FileStatus = "pending" | "uploading" | "done" | "error";

interface FileEntry {
  file: File;
  status: FileStatus;
  error?: string;
}

export function LibraryToolbar() {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setEntries(files.map((file) => ({ file, status: "pending" as FileStatus })));
  };

  const removeEntry = (index: number) => {
    setEntries((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0 && fileInputRef.current) fileInputRef.current.value = "";
      return next;
    });
  };

  const handleUpload = async () => {
    if (entries.length === 0 || uploading) return;
    setUploading(true);

    for (let i = 0; i < entries.length; i++) {
      if (entries[i].status === "done") continue;

      setEntries((prev) =>
        prev.map((e, idx) => (idx === i ? { ...e, status: "uploading" as FileStatus } : e)),
      );

      const formData = new FormData();
      // Send the filename as a plain UTF-8 string field BEFORE the file.
      // Browsers reliably encode string fields as UTF-8; Content-Disposition
      // filename encoding is inconsistent for non-ASCII (Hebrew) characters.
      formData.append("displayName", entries[i].file.name);
      formData.append("file", entries[i].file);

      const result: ActionResult = await uploadFileAction({}, formData);

      setEntries((prev) =>
        prev.map((e, idx) =>
          idx === i
            ? { ...e, status: result.success ? "done" : "error", error: result.error }
            : e,
        ),
      );
    }

    setUploading(false);

    setTimeout(() => {
      setEntries((prev) => {
        const remaining = prev.filter((e) => e.status !== "done");
        if (remaining.length === 0 && fileInputRef.current) fileInputRef.current.value = "";
        return remaining;
      });
    }, 2000);
  };

  const doneCount = entries.filter((e) => e.status === "done").length;

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.md,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="cursor-pointer flex-1"
          onChange={handleFileChange}
          disabled={uploading}
        />
        <Button
          size="sm"
          disabled={entries.length === 0 || uploading}
          onClick={handleUpload}
          className="shrink-0 gap-2"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {he.library.uploadingProgress(doneCount, entries.length)}
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              {entries.length > 1 ? he.library.uploadFiles(entries.length) : he.library.upload}
            </>
          )}
        </Button>
      </div>

      {entries.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 border-t pt-3">
          {entries.map((entry, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              {entry.status === "uploading" && (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
              )}
              {entry.status === "done" && (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              )}
              {entry.status === "error" && (
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
              )}
              {entry.status === "pending" && (
                <span className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {entry.file.name}
              </span>
              {entry.error && (
                <span className="shrink-0 text-xs text-destructive">{entry.error}</span>
              )}
              {entry.status === "pending" && !uploading && (
                <button
                  type="button"
                  aria-label="הסרה"
                  onClick={() => removeEntry(i)}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
