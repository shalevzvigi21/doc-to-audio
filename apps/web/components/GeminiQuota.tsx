"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Zap } from "lucide-react";
import type { TtsQuotaResponse } from "@doc-to-audio/types";
import { he } from "@/lib/strings";

function formatReset(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}ש׳ ${m}ד׳`;
  return `${m}ד׳`;
}

export function GeminiQuota({ initial }: { initial: TtsQuotaResponse | null }) {
  const [quota, setQuota] = useState<TtsQuotaResponse | null>(initial);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/tts/quota", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as TtsQuotaResponse;
        if (!cancelled) setQuota(next);
      } catch {
        /* keep last snapshot */
      }
    };
    void load();
    const id = setInterval(load, 20000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!quota) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-xs text-muted-foreground">
        <Zap className="h-3.5 w-3.5" />
        {he.tts.loading}
      </div>
    );
  }

  const { gemini, azureAvailable } = quota;

  if (gemini.exhausted) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive dark:text-red-400">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <div className="flex flex-col">
          <span className="font-medium">{he.tts.exhausted}</span>
          {gemini.resetsInSeconds != null && (
            <span className="opacity-80">
              {he.tts.resetsInPrefix} {formatReset(gemini.resetsInSeconds)}
            </span>
          )}
        </div>
      </div>
    );
  }

  const pct = gemini.limit > 0 ? gemini.remaining / gemini.limit : 0;
  const barColor =
    pct > 0.5
      ? "bg-emerald-500"
      : pct > 0.2
      ? "bg-amber-500"
      : "bg-destructive";

  return (
    <div className="flex min-w-[160px] flex-col gap-1 rounded-lg border bg-card px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 font-medium text-foreground">
          <Zap className="h-3.5 w-3.5 text-primary" />
          {he.tts.budgetTitle}
        </span>
        <span className="tabular-nums font-semibold text-foreground">
          {gemini.estimatedPagesRemaining}
          <span className="text-muted-foreground font-normal"> {he.tts.pagesLeftSuffix}</span>
        </span>
      </div>

      {/* Fuel gauge bar */}
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-muted-foreground">
        <span className="tabular-nums">
          {gemini.remaining}/{gemini.limit} {he.tts.requestsLeft}
        </span>
        {!azureAvailable && (
          <span className="opacity-70">{he.tts.azureUnavailable}</span>
        )}
      </div>
    </div>
  );
}
