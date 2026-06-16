import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { getFileTree, apiFetch, ApiError } from "@/lib/api";
import { LibraryToolbar } from "@/components/LibraryToolbar";
import { FolderTree } from "@/components/FolderTree";
import { FileList } from "@/components/FileList";
import { GeminiQuota } from "@/components/GeminiQuota";
import { LogoutButton } from "@/components/LogoutButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { he } from "@/lib/strings";
import type { FileTree, FolderNode, TtsQuotaResponse } from "@doc-to-audio/types";
import NewFolderForm from "@/components/NewFolderForm";

function flattenFolders(nodes: FolderNode[]): Array<{ id: string; name: string }> {
  return nodes.flatMap((n) => [{ id: n.id, name: n.name }, ...flattenFolders(n.children)]);
}

export const metadata = { title: he.meta.library };
export const dynamic = "force-dynamic";

export default async function LibraryPage() {
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
  const hasFolders = tree.folders.length > 0;
  const hasRootFiles = tree.files.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur-sm">
        <div className="container flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <BookOpen className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold tracking-tight">{he.library.heading}</h1>
          </div>
          <div className="flex items-center gap-2">
            <GeminiQuota initial={quota} />
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="container flex min-h-[calc(100vh-4rem)] gap-0">
        {/* ── Sidebar (folders) ── */}
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 flex-col gap-4 overflow-y-auto border-e py-6 pe-4 md:flex">
          {hasFolders && (
            <section>
              <h2 className="mb-2 px-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {he.library.foldersHeading}
              </h2>
              <FolderTree
                folders={tree.folders}
                allFolders={allFolders}
                azureAvailable={azureAvailable}
              />
            </section>
          )}

          {/* New folder form */}
          <section className="mt-auto">
            <NewFolderForm />
          </section>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 space-y-8 py-6 ps-0 md:ps-6">
          {/* Upload widget */}
          <LibraryToolbar />

          {/* Mobile folders (shown below upload on small screens) */}
          {hasFolders && (
            <section className="md:hidden">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {he.library.foldersHeading}
              </h2>
              <div className="rounded-xl border bg-card p-3">
                <FolderTree
                  folders={tree.folders}
                  allFolders={allFolders}
                  azureAvailable={azureAvailable}
                />
              </div>
            </section>
          )}

          {/* Root-level files */}
          {(hasRootFiles || !hasFolders) && (
            <section>
              {hasFolders && (
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {he.library.rootFilesHeading}
                </h2>
              )}
              {tree.files.length === 0 && tree.folders.length === 0 ? (
                <div className="rounded-xl border border-dashed bg-card p-16 text-center">
                  <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/40" />
                  <h2 className="mt-4 text-base font-semibold">{he.library.emptyTitle}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {he.library.emptyDescription}
                  </p>
                </div>
              ) : (
                <FileList
                  files={tree.files}
                  allFolders={allFolders}
                  azureAvailable={azureAvailable}
                />
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
