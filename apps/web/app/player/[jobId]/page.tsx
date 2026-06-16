import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, BookOpen, Headphones } from "lucide-react";
import type { JobStatusResponse } from "@doc-to-audio/types";
import { apiFetch, ApiError } from "@/lib/api";
import { PlayerView } from "@/components/PlayerView";
import { ThemeToggle } from "@/components/ThemeToggle";
import { he } from "@/lib/strings";
import { Button } from "@/components/ui/button";

export const metadata = { title: he.meta.player };
export const dynamic = "force-dynamic";

export default async function PlayerPage({ params }: { params: { jobId: string } }) {
  let job: JobStatusResponse;
  try {
    job = await apiFetch<JobStatusResponse>(`/jobs/${params.jobId}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect("/api/auth/logout");
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/90 backdrop-blur-sm">
        <div className="container flex h-16 items-center justify-between">
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link href="/library">
              <ArrowRight className="h-4 w-4" />
              {he.player.libraryLink}
            </Link>
          </Button>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <BookOpen className="h-4 w-4" />
            <span className="text-sm font-medium">{he.app.title}</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Hero band */}
      <div className="border-b bg-primary/5 py-8">
        <div className="container flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 shadow-inner">
            <Headphones className="h-8 w-8 text-primary" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {he.player.nowPlaying}
            </p>
            <p className="text-lg font-semibold text-foreground">
              {he.player.nowPlayingDescription}
            </p>
          </div>
        </div>
      </div>

      {/* Player card */}
      <main className="container py-10">
        <div className="mx-auto max-w-xl rounded-2xl border bg-card p-8 shadow-lg">
          <PlayerView initial={job} />
        </div>
      </main>
    </div>
  );
}
