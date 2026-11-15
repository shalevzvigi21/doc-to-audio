"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, RotateCw } from "lucide-react";
import { mobileB1 } from "@/lib/mobile-strings-b1";

const STORAGE_KEY = "library-error-wake-start";
const RETRY_INTERVAL_MS = 5000;
const MAX_WAIT_MS = 60000;

function getStartTime(): number {
  if (typeof window === "undefined") return Date.now();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? parseInt(raw, 10) : NaN;
    if (!isNaN(parsed) && Date.now() - parsed < MAX_WAIT_MS * 2 && Date.now() >= parsed) {
      return parsed;
    }
    const now = Date.now();
    sessionStorage.setItem(STORAGE_KEY, String(now));
    return now;
  } catch {
    return Date.now();
  }
}

function clearStartTime(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    /* ignore storage access issues */
  }
}

/**
 * Friendly error screen shown when the server is waking up or temporarily unavailable.
 * Auto-retries every 5 seconds up to 60 seconds, then presents a manual retry button.
 */
export default function LibraryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [timedOut, setTimedOut] = useState(false);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const resetRef = useRef(reset);
  resetRef.current = reset;

  useEffect(() => {
    // Internal logging for diagnostics; do not display raw error to the user
    console.error("Library page error encountered:", error?.message || error);
  }, [error]);

  useEffect(() => {
    const startTime = getStartTime();
    const elapsed = Date.now() - startTime;

    if (elapsed >= MAX_WAIT_MS) {
      setTimedOut(true);
      return;
    }

    const timer = setTimeout(() => {
      const currentElapsed = Date.now() - startTime;
      if (currentElapsed >= MAX_WAIT_MS) {
        setTimedOut(true);
      } else {
        resetRef.current();
      }
    }, RETRY_INTERVAL_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [retryTrigger]);

  const handleManualRetry = () => {
    clearStartTime();
    setTimedOut(false);
    setRetryTrigger((prev) => prev + 1);
    reset();
  };

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[880px] flex-col items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-[520px] flex-col items-center rounded-[28px] border bg-card p-6 text-center shadow-lg sm:p-8">
        {!timedOut ? (
          <>
            <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-soft text-primary">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {mobileB1.error.wakingTitle}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              {mobileB1.error.wakingDesc}
            </p>
            <div className="mt-6 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
              <span>{mobileB1.error.retrying}</span>
            </div>
          </>
        ) : (
          <>
            <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertCircle className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {mobileB1.error.failedTitle}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              {mobileB1.error.failedDesc}
            </p>
            <button
              type="button"
              onClick={handleManualRetry}
              className="mt-6 inline-flex h-12 min-w-[140px] items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-base font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RotateCw className="h-4 w-4" />
              <span>{mobileB1.error.retryButton}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
