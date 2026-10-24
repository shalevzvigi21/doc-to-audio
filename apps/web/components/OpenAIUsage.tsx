"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { OPENAI_KEY_CHANGED, openOpenAISetup, type OpenAIKeyStatus } from "@/components/OpenAISetup";
import { formatShekels, usdToShekels } from "@/lib/openai-catalog";
import { he } from "@/lib/strings";

interface Usage {
  totalUsd: number;
  conversions: number;
  byModel: Array<{ model: string; costUsd: number }>;
  openaiKey: OpenAIKeyStatus;
}

const pill = "flex items-center gap-2 whitespace-nowrap rounded-full border bg-card py-1.5 ps-2.5 pe-3 text-[13px] text-muted-foreground";

/** Header pill: roughly how much was spent on OpenAI this month (in shekels), or a prompt to add a key. */
export function OpenAIUsage() {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/openai/usage", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as Usage;
        if (!cancelled) setUsage(next);
      } catch {
        /* keep the last snapshot */
      }
    };
    void load();
    const id = setInterval(load, 30000);
    window.addEventListener(OPENAI_KEY_CHANGED, load);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener(OPENAI_KEY_CHANGED, load);
    };
  }, []);

  if (!usage) return <div className={pill}>{he.usage.loading}</div>;

  // No key of any kind: the pill is the way into the setup guide.
  if (usage.openaiKey.source === "none") {
    return (
      <button
        type="button"
        onClick={openOpenAISetup}
        aria-label={he.openaiKey.openAria}
        className={cn(pill, "border-warn/40 bg-warn/10 font-medium text-warn hover:brightness-95")}
      >
        <KeyRound className="h-4 w-4" />
        {he.openaiKey.pillMissing}
        <span className="rounded-full bg-warn px-2 py-px text-xs text-background">{he.openaiKey.pillAdd}</span>
      </button>
    );
  }

  const breakdown = usage.byModel.map((m) => `${m.model}: ${formatShekels(usdToShekels(m.costUsd))}`).join(" · ");

  return (
    <button
      type="button"
      onClick={openOpenAISetup}
      aria-label={he.openaiKey.openAria}
      className={cn(pill, "hover:border-foreground/30")}
      title={`${he.usage.tooltip(usage.conversions)}${breakdown ? `\n${breakdown}` : ""}`}
    >
      <span className="max-sm:hidden">{he.usage.thisMonth}</span>
      <span className="sm:hidden">{he.usage.thisMonthShort}</span>
      <b className="num font-semibold text-foreground">
        {he.usage.about}
        {formatShekels(usdToShekels(usage.totalUsd))}
      </b>
    </button>
  );
}
