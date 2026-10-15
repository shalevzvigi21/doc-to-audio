import Link from "next/link";
import { redirect } from "next/navigation";
import { Folder } from "lucide-react";
import { getFileTree, apiFetch, ApiError } from "@/lib/api";
import { LibraryToolbar } from "@/components/LibraryToolbar";
import { FileList, type LibraryItem } from "@/components/FileList";
import { FolderActions } from "@/components/FolderActions";
import { GeminiQuota } from "@/components/GeminiQuota";
import { LogoutButton } from "@/components/LogoutButton";
import { TopBar } from "@/components/TopBar";
import NewFolderForm from "@/components/NewFolderForm";
import { cn } from "@/lib/utils";
import { he } from "@/lib/strings";
import type { FileRecord, FileTree, FolderNode, TtsQuotaResponse } from "@doc-to-audio/types";

function flattenFolders(nodes: FolderNode[]): Array<{ id: string; name: string }> {
  return nodes.flatMap((n) => [{ id: n.id, name: n.name }, ...flattenFolders(n.children)]);
}

/** Every file in a folder subtree, tagged with the name of the folder it lives in. */
function collectItems(node: FolderNode): LibraryItem[] {
  return [
    ...node.files.map((file) => ({ file, folderName: node.name })),
    ...node.children.flatMap(collectItems),
  ];
}

function findFolder(nodes: FolderNode[], id: string): FolderNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findFolder(n.children, id);
    if (hit) return hit;
  }
  return undefined;
}

const byNewest = (a: LibraryItem, b: LibraryItem) =>
  new Date(b.file.createdAt).getTime() - new Date(a.file.createdAt).getTime();

const chipBase =
  "inline-flex h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm transition-colors";

export const metadata = { title: he.meta.library };
export const dynamic = "force-dynamic";

export default async function LibraryPage({ searchParams }: { searchParams: { folder?: string } }) {
  let tree: FileTree;
  try {
    tree = await getFileTree();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect("/api/auth/logout");
    }
    throw err;
  }

  const quota = await apiFetch<TtsQuotaResponse>("/tts/quota").catch(() => null);
  const azureAvailable = quota?.azureAvailable ?? false;
  const allFolders = flattenFolders(tree.folders);

  const selected = searchParams.folder ? findFolder(tree.folders, searchParams.folder) : undefined;
  const items: LibraryItem[] = (
    selected
      ? collectItems(selected)
      : [
          ...tree.files.map((file) => ({ file, folderName: null })),
          ...tree.folders.flatMap(collectItems),
        ]
  ).sort(byNewest);

  const total = tree.files.length + tree.folders.flatMap(collectItems).length;
  const convertibleIds = selected
    ? collectItems(selected)
        .map((i) => i.file)
        .filter((f: FileRecord) => f.status === "PENDING" || f.status === "ERROR" || f.status === "DONE")
        .map((f) => f.id)
    : [];

  return (
    <div className="mx-auto max-w-[880px] px-4 pb-36">
      <TopBar>
        <GeminiQuota initial={quota} />
        <LogoutButton />
      </TopBar>

      <LibraryToolbar folderId={selected?.id} />

      <nav aria-label={he.library.foldersAria} className="mt-7 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        <Link
          href="/library"
          scroll={false}
          aria-current={!selected ? "page" : undefined}
          className={cn(chipBase, !selected ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground")}
        >
          {he.library.all} <span className="num text-xs opacity-70">{total}</span>
        </Link>
        {tree.folders.map((f) => {
          const active = selected?.id === f.id;
          return (
            <Link
              key={f.id}
              href={`/library?folder=${f.id}`}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn(chipBase, active ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground")}
            >
              <Folder className="h-4 w-4" />
              <span dir="auto">{f.name}</span>
              <span className="num text-xs opacity-70">{collectItems(f).length}</span>
            </Link>
          );
        })}
        <NewFolderForm />
      </nav>

      {selected && <FolderActions folderId={selected.id} name={selected.name} convertibleIds={convertibleIds} />}

      <FileList items={items} allFolders={allFolders} azureAvailable={azureAvailable} />
    </div>
  );
}
