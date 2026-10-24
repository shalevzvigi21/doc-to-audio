import { prisma } from "../lib/prisma.js";

/**
 * Approximate cost of OpenAI speech, in US dollars. These are ESTIMATES: OpenAI
 * does not return a bill with each request, so we price what we can measure.
 *
 * Published rates (checked October 2026):
 *   tts-1            $15 per 1M characters
 *   tts-1-hd         $30 per 1M characters
 *   gpt-4o-mini-tts  billed on audio; OpenAI's own estimate is ~$0.015 per minute
 *
 * The real invoice (OpenAI dashboard → Usage) is always the source of truth.
 */
const PER_MILLION_CHARS: Record<string, number> = { "tts-1": 15, "tts-1-hd": 30 };
const MINI_TTS_PER_MINUTE = 0.015;

export function estimateCostUsd(model: string, chars: number, seconds: number): number {
  const perMillion = PER_MILLION_CHARS[model];
  if (perMillion !== undefined) return (chars * perMillion) / 1_000_000;
  return (seconds / 60) * MINI_TTS_PER_MINUTE;
}

export interface UsageInput {
  userId: string;
  kind: "conversion" | "sample";
  model: string;
  voice: string;
  chars: number;
  seconds: number;
  fileName?: string;
}

/** Remember one OpenAI request's estimated cost. Never throws: tracking must not break a conversion. */
export async function recordUsage(u: UsageInput): Promise<void> {
  try {
    await prisma.usageEntry.create({
      data: {
        userId: u.userId,
        kind: u.kind,
        model: u.model,
        voice: u.voice,
        chars: Math.round(u.chars),
        seconds: u.seconds,
        costUsd: estimateCostUsd(u.model, u.chars, u.seconds),
        fileName: u.fileName ?? null,
      },
    });
  } catch (err) {
    console.warn("[usage] could not record usage entry:", (err as Error).message);
  }
}

export function startOfThisMonth(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Estimated spend for the calendar month so far, plus a per-model breakdown. */
export async function monthlySpend(userId: string): Promise<{
  monthStart: string;
  totalUsd: number;
  conversions: number;
  byModel: Array<{ model: string; costUsd: number }>;
}> {
  const since = startOfThisMonth();
  const rows = await prisma.usageEntry.findMany({
    where: { userId, createdAt: { gte: since } },
    select: { kind: true, model: true, costUsd: true },
  });
  const byModel = new Map<string, number>();
  let totalUsd = 0;
  let conversions = 0;
  for (const r of rows) {
    totalUsd += r.costUsd;
    byModel.set(r.model, (byModel.get(r.model) ?? 0) + r.costUsd);
    if (r.kind === "conversion") conversions++;
  }
  return {
    monthStart: since.toISOString(),
    totalUsd,
    conversions,
    byModel: [...byModel.entries()].map(([model, costUsd]) => ({ model, costUsd })),
  };
}
