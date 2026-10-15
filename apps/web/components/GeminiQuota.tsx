"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { TtsQuotaResponse } from "@doc-to-audio/types";
import { cn } from "@/lib/utils";
import { he } from "@/lib/strings";

function formatReset(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}ש׳ ${m}ד׳`;
  return `${m}ד׳`;
}

const pill = "flex items-center gap-2 rounded-full border bg-card py-1.5 ps-2.5 pe-3 text-[13px] text-muted-foreground";

/** Compact daily-quota pill for the header. */
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
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!quota) return <div className={pill}>{he.tts.loading}</div>;

  const { gemini, azureAvailable } = quota;

  if (gemini.exhausted) {
    return (
      <div
        className={cn(pill, "border-destructive/40 bg-destructive/10 text-destructive")}
        title={azureAvailable ? he.tts.azureHint : he.tts.azureUnavailable}
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="font-medium">
          {he.tts.exhausted}
          {gemini.resetsInSeconds != null && ` · ${he.tts.resetsInPrefix} ${formatReset(gemini.resetsInSeconds)}`}
        </span>
      </div>
    );
  }

  const pct = gemini.limit > 0 ? gemini.remaining / gemini.limit : 0;
  const bar = pct > 0.5 ? "bg-ok" : pct > 0.2 ? "bg-warn" : "bg-destructive";

  return (
    <div
      className={pill}
      title={`${he.tts.budgetTitle}: ${gemini.remaining}/${gemini.limit} ${he.tts.requestsLeft}${azureAvailable ? "" : ` · ${he.tts.azureUnavailable}`}`}
    >
      <span>Gemini</span>
      <span className="hidden h-[5px] w-9 overflow-hidden rounded-full bg-secondary sm:block">
        <span className={cn("block h-full rounded-full transition-all duration-700", bar)} style={{ width: `${Math.round(pct * 100)}%` }} />
      </span>
      <b className="num font-semibold text-foreground">~{gemini.estimatedPagesRemaining}</b>
      <span className="max-sm:hidden">{he.tts.pagesShort}</span>
    </div>
  );
}
