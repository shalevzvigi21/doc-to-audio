"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, AlertTriangle, BookOpen, Clock, Loader2, Mic2, RotateCcw } from "lucide-react";
import type { JobStatusResponse } from "@doc-to-audio/types";
import { Button } from "@/components/ui/button";
import { AudioPlayer } from "@/components/AudioPlayer";
import { queueFileAction } from "@/lib/actions/library";
import { he } from "@/lib/strings";

interface PlayerViewProps {
  initial: JobStatusResponse;
}

export function PlayerView({ initial }: PlayerViewProps) {
  const router = useRouter();
  const [job, setJob] = useState<JobStatusResponse>(initial);
  const [isStuck, setIsStuck] = useState(false);
  const [restarting, setRestarting] = useState(false);

  // Track when progress last changed to detect a stuck job.
  const lastProgressRef = useRef(initial.progress);
  const lastProgressAtRef = useRef(Date.now());

  useEffect(() => {
    if (job.status === "DONE" || job.status === "ERROR") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as JobStatusResponse;
        setJob(next);
        if (next.status === "DONE" || next.status === "ERROR") {
          clearInterval(interval);
          return;
        }
        if (next.progress !== lastProgressRef.current) {
          lastProgressRef.current = next.progress;
          lastProgressAtRef.current = Date.now();
          setIsStuck(false);
        } else if (Date.now() - lastProgressAtRef.current > 40_000) {
          setIsStuck(true);
        }
      } catch {
        /* keep polling */
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [job.id, job.status]);

  const handleRestart = async () => {
    setRestarting(true);
    await queueFileAction(job.fileId);
    setJob((prev) => ({ ...prev, status: "PENDING", progress: 0 }));
    lastProgressRef.current = 0;
    lastProgressAtRef.current = Date.now();
    setIsStuck(false);
    setRestarting(false);
  };

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
          <Button onClick={handleRestart} disabled={restarting}>
            {restarting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            {he.player.restart}
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
          <h2 className="flex flex-wrap items-center justify-center gap-2 text-lg font-semibold">
            {job.status === "PROCESSING"
              ? isOcr
                ? "קורא את המסמך…"
                : he.player.generating
              : he.player.queued}
            {isStuck && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-sm font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                {he.file.interrupted}
              </span>
            )}
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
              className={[
                "h-full rounded-full transition-all duration-500",
                isStuck ? "bg-amber-400" : "bg-primary",
              ].join(" ")}
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

        {/* Stuck detection banner or subtle restart link */}
        {isStuck ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-amber-300/50 bg-amber-50/50 px-4 py-3 text-center dark:bg-amber-900/10">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              {he.player.stuckHint}
            </p>
            <Button size="sm" variant="outline" disabled={restarting} onClick={handleRestart}>
              {restarting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              {he.player.restart}
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="gap-1 text-xs text-muted-foreground"
            disabled={restarting}
            onClick={handleRestart}
          >
            <RotateCcw className="h-3 w-3" />
            {he.player.restart}
          </Button>
        )}
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
