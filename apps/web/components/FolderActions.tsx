"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListVideo, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { convertFilesAction, deleteFolderAction } from "@/lib/actions/library";
import { openGeminiSetup } from "@/components/GeminiSetup";
import { he } from "@/lib/strings";

/** Actions for the folder that is currently selected: convert everything, or delete it. */
export function FolderActions({
  folderId,
  name,
  convertibleIds,
}: {
  folderId: string;
  name: string;
  convertibleIds: string[];
}) {
  const router = useRouter();
  const [convertPending, startConvert] = useTransition();
  const [deletePending, startDelete] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const convertAll = () =>
    startConvert(async () => {
      const { queued, failed, missingKey } = await convertFilesAction(convertibleIds);
      if (missingKey) openGeminiSetup();
      setMessage(
        missingKey ? he.gemini.missingShort : failed > 0 ? he.library.convertAllError : he.library.convertAllDone(queued),
      );
      setTimeout(() => setMessage(null), 3000);
    });

  const remove = () => {
    if (!confirm) {
      setConfirm(true);
      setTimeout(() => setConfirm(false), 4000);
      return;
    }
    startDelete(async () => {
      await deleteFolderAction(folderId);
      router.push("/library");
    });
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span dir="auto" className="me-1 font-semibold">
        {name}
      </span>
      {convertibleIds.length > 0 && (
        <Button size="sm" variant="secondary" disabled={convertPending} onClick={convertAll}>
          {convertPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListVideo className="h-4 w-4" />}
          {he.library.convertAll}
        </Button>
      )}
      <Button size="sm" variant="ghost" disabled={deletePending} onClick={remove} className="text-destructive hover:text-destructive">
        <Trash2 className="h-4 w-4" />
        {confirm ? he.library.deleteFolderConfirm : he.file.deleteFolder}
      </Button>
      {message && (
        <span className="text-primary" role="status">
          {message}
        </span>
      )}
    </div>
  );
}
