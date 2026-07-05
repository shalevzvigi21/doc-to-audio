"use client";

import { useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  ListVideo,
  Loader2,
  Trash2,
} from "lucide-react";
import type { FolderNode, FileRecord } from "@doc-to-audio/types";
import { Button } from "@/components/ui/button";
import { deleteFolderAction, convertFilesAction } from "@/lib/actions/library";
import { he } from "@/lib/strings";

type FlatFolder = { id: string; name: string };

/** Collect all files in a folder subtree that are eligible for (re)conversion. */
function collectConvertible(node: FolderNode): FileRecord[] {
  const eligible = node.files.filter(
    (f) => f.status === "PENDING" || f.status === "ERROR" || f.status === "DONE",
  );
  return [...eligible, ...node.children.flatMap(collectConvertible)];
}

function FolderBranch({
  node,
  depth,
  allFolders,
  azureAvailable,
}: {
  node: FolderNode;
  depth: number;
  allFolders: FlatFolder[];
  azureAvailable: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [convertPending, startConvertTransition] = useTransition();
  const [convertMsg, setConvertMsg] = useState<string | null>(null);

  const childCount = node.children.length + node.files.length;
  const convertible = collectConvertible(node);

  const handleConvertAll = () => {
    if (convertible.length === 0) return;
    startConvertTransition(async () => {
      const { queued, failed } = await convertFilesAction(convertible.map((f) => f.id));
      setConvertMsg(
        failed > 0 ? he.library.convertAllError : he.library.convertAllDone(queued),
      );
      setTimeout(() => setConvertMsg(null), 3000);
    });
  };

  return (
    <li>
      {/* Folder header */}
      <div
        className="group flex items-center justify-between gap-1 rounded-lg px-2 py-1.5 hover:bg-accent/50 transition-colors"
        style={{ paddingInlineStart: `${8 + depth * 14}px` }}
      >
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            document.getElementById(`folder-${node.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          className="flex min-w-0 flex-1 items-center gap-2 text-start"
        >
          <span className="text-muted-foreground">
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </span>
          {open ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-primary" />
          )}
          <span className="truncate text-sm font-medium" dir="auto">
            {node.name}
          </span>
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {childCount}
          </span>
        </button>

        {/* Action buttons — visible on hover */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {convertible.length > 0 && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              title={he.library.convertAll}
              aria-label={he.library.convertAll}
              disabled={convertPending}
              onClick={handleConvertAll}
            >
              {convertPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ListVideo className="h-3.5 w-3.5 text-primary" />
              )}
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label={he.file.deleteFolder}
            disabled={isPending}
            onClick={() => startTransition(async () => { await deleteFolderAction(node.id); })}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>

      {/* Convert-all feedback */}
      {convertMsg && (
        <p className="px-3 pb-1 text-xs text-primary">{convertMsg}</p>
      )}

      {/* Children — nested folders only; files are rendered in main content */}
      {open && node.children.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {node.children.map((child) => (
            <FolderBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              allFolders={allFolders}
              azureAvailable={azureAvailable}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function FolderTree({
  folders,
  allFolders,
  azureAvailable = false,
}: {
  folders: FolderNode[];
  allFolders: FlatFolder[];
  azureAvailable?: boolean;
}) {
  if (folders.length === 0) return null;
  return (
    <ul className="space-y-0.5">
      {folders.map((folder) => (
        <FolderBranch
          key={folder.id}
          node={folder}
          depth={0}
          allFolders={allFolders}
          azureAvailable={azureAvailable}
        />
      ))}
    </ul>
  );
}
