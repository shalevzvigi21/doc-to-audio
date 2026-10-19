import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, ExternalLink, FileText } from "lucide-react";
import type { JobStatusResponse } from "@doc-to-audio/types";
import { apiFetch, ApiError } from "@/lib/api";
import { PlayerView } from "@/components/PlayerView";
import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { he } from "@/lib/strings";

export const metadata = { title: he.meta.player };
export const dynamic = "force-dynamic";

const EXT = /\.(pdf|docx|txt|md)$/i;

export default async function PlayerPage({ params }: { params: { jobId: string } }) {
  let job: JobStatusResponse;
  try {
    job = await apiFetch<JobStatusResponse>(`/jobs/${params.jobId}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect("/api/auth/logout");
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const isPdf = job.mimeType === "application/pdf";
  const ext = job.fileName.match(EXT)?.[1]?.toUpperCase();

  return (
    <div className="mx-auto max-w-[620px] px-4 pb-16">
      <header className="flex items-center justify-between py-3.5">
        <Link
          href="/library"
          className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm text-muted-foreground hover:bg-card hover:text-foreground"
        >
          <ArrowRight className="h-4 w-4" />
          {he.player.libraryLink}
        </Link>
        <Brand className="text-base max-sm:hidden" />
        <ThemeToggle />
      </header>

      <main className="mt-4 space-y-4">
        <div className="rounded-[32px] border bg-card p-6 sm:p-8">
          <p className="text-xs font-medium tracking-widest text-muted-foreground">{he.player.nowPlaying}</p>
          <h1 dir="auto" className="mt-2 text-balance text-2xl font-extrabold leading-tight tracking-tight sm:text-[28px]" title={job.fileName}>
            {job.fileName.replace(EXT, "")}
          </h1>
          {ext && <p className="num mt-1 text-sm text-muted-foreground">{ext}</p>}
          <div className="mt-2">
            <PlayerView initial={job} />
          </div>
          <a
            href={`/api/files/${job.fileId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-secondary text-sm font-medium hover:bg-secondary/80"
          >
            <ExternalLink className="h-4 w-4" />
            {he.player.openDoc}
          </a>
        </div>

        <details className="group rounded-[24px] border bg-card">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-6 py-4 text-sm font-medium select-none">
            <FileText className="h-4 w-4 text-muted-foreground" />
            {he.player.viewDoc}
          </summary>
          <div className="border-t px-4 pb-4 pt-3">
            {isPdf ? (
              <iframe src={`/api/files/${job.fileId}`} className="h-[70vh] w-full rounded-xl border-0" title={job.fileName} />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">{he.player.viewDocUnsupported}</p>
            )}
          </div>
        </details>
      </main>
    </div>
  );
}
