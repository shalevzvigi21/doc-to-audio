"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, BookOpen, Clock, Loader2, Mic2 } from "lucide-react";
import type { JobStatusResponse } from "@doc-to-audio/types";
import { Button } from "@/components/ui/button";
import { AudioPlayer } from "@/components/AudioPlayer";
import { he } from "@/lib/strings";

interface PlayerViewProps {
  initial: JobStatusResponse;
}

export function PlayerView({ initial }: PlayerViewProps) {
  const router = useRouter();
  const [job, setJob] = useState<JobStatusResponse>(initial);

  useEffect(() => {
    if (job.status === "DONE" || job.status === "ERROR") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as JobStatusResponse;
        setJob(next);
        if (next.status === "DONE" || next.status === "ERROR") clearInterval(interval);
      } catch {
        /* keep polling */
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [job.id, job.status]);

  if (job.status === "ERROR") {
    return (
      <div className="flex flex-col items-center gap-6 py-10 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-10 w-10 text-destructive" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{he.player.failedTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{he.player.failedDescription}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/library")}>
            {he.player.backToLibrary}
          </Button>
          <Button onClick={() => router.refresh()}>
            {he.file.retry}
          </Button>
        </div>
      </div>
    );
  }

  if (job.status !== "DONE") {
    const percent = Math.max(0, Math.min(100, Math.round(job.progress)));
    const isOcr = percent < 70;

    return (
      <div className="flex flex-col items-center gap-6 py-8 text-center">
        {/* Animated icon */}
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          {isOcr ? (
            <BookOpen className="h-9 w-9 text-primary" />
          ) : (
            <Mic2 className="h-9 w-9 text-primary" />
          )}
          <Loader2 className="absolute inset-0 m-auto h-20 w-20 animate-spin text-primary/30" />
        </div>

        <div>
          <h2 className="text-lg font-semibold">
            {job.status === "PROCESSING"
              ? isOcr
                ? "קורא את המסמך…"
                : he.player.generating
              : he.player.queued}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{he.player.autoUpdate}</p>
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-sm space-y-2">
          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-secondary"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {isOcr ? "זיהוי טקסט" : "המרה לאודיו"}
            </span>
            <span className="tabular-nums font-medium">{percent}%</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AudioPlayer
      jobId={job.id}
      src={`/api/audio/${job.id}`}
      duration={job.duration}
      initialPosition={job.lastPosition}
    />
  );
}
