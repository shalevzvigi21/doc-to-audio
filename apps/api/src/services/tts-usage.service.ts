import { connection } from "../lib/redis.js";
import { config } from "../config.js";

/**
 * Tracks Gemini TTS request usage against the free-tier **daily** cap so the UI
 * can show how much budget is left and warn the user when to switch to Azure.
 *
 * The free tier allows 100 `generate_requests_per_model_per_day`. We keep a
 * best-effort per-day counter in Redis (incremented once per request that the
 * API actually processed) plus an "exhausted" marker we set the moment Gemini
 * returns a real per-day 429 — that marker is the authoritative "stop using
 * Gemini now" signal, while the counter is a soft estimate.
 *
 * The counter resets via a date-stamped key (UTC). Google's real reset is at
 * midnight Pacific, so the count is an approximation — the exhausted marker,
 * derived from the API's own retry delay, is exact for "when can I use it
 * again".
 */

/** Free-tier per-day request cap for the Gemini TTS model. */
export const GEMINI_DAILY_LIMIT = 100;

/**
 * Global Gemini request-rate gate, shared across every caller (TTS synthesis
 * AND text reconstruction). The free tier allows ~15 requests per minute; the
 * recursive TTS splitter, parallel chunk batches, per-page reconstruction, and
 * concurrent worker jobs can otherwise burst far past that and trigger a 429
 * cascade. Spacing every request start at least MIN_REQUEST_INTERVAL_MS apart
 * caps the effective rate under the quota no matter how many callers are in
 * flight. ~4.5s ≈ 13 req/min, just under the 15 RPM cap. The module-level
 * `nextRequestAt` cursor serializes request *starts* process-wide.
 */
const MIN_REQUEST_INTERVAL_MS = 4500;
let nextRequestAt = 0;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Await this before starting any Gemini request to respect the shared RPM cap. */
export async function geminiRateGate(): Promise<void> {
  const now = Date.now();
  const startAt = Math.max(now, nextRequestAt);
  nextRequestAt = startAt + MIN_REQUEST_INTERVAL_MS;
  const wait = startAt - now;
  if (wait > 0) await sleep(wait);
}

/** Chars per Gemini request (mirrors MAX_CHARS in tts.service). */
const CHARS_PER_REQUEST = 4800;
/** Assumed characters on a typical (OCR'd book) page — for the page estimate. */
const CHARS_PER_PAGE = 2000;

const TWO_DAYS_SECONDS = 2 * 24 * 60 * 60;

/** UTC date stamp (YYYY-MM-DD) used to bucket — and auto-reset — the counter. */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

const usedKey = () => `tts:gemini:used:${todayKey()}`;
/** Per-key exhaustion marker: which key index ran out of daily quota. */
const keyExhaustedKey = (keyIndex: number) => `tts:gemini:exhausted:${keyIndex}:${todayKey()}`;

/** Count one Gemini request that the API processed. Best-effort (never throws). */
export async function incrementGeminiUsage(n = 1): Promise<void> {
  try {
    const key = usedKey();
    await connection.incrby(key, n);
    await connection.expire(key, TWO_DAYS_SECONDS);
  } catch {
    /* the counter is a soft estimate — ignore Redis hiccups */
  }
}

/**
 * Mark a specific Gemini API key as having exhausted its daily quota.
 * Stores the absolute reset epoch (seconds) so we know when it recovers.
 */
export async function markKeyExhausted(keyIndex: number, resetInSeconds: number | null): Promise<void> {
  try {
    const key = keyExhaustedKey(keyIndex);
    const resetAt = Math.floor(Date.now() / 1000) + (resetInSeconds && resetInSeconds > 0 ? resetInSeconds : 0);
    await connection.set(key, String(resetAt), "EX", TWO_DAYS_SECONDS);
  } catch {
    /* best-effort */
  }
}

/**
 * Check whether a specific API key index has exhausted its daily quota
 * and the reset time hasn't passed yet.
 */
async function isKeyExhausted(keyIndex: number): Promise<boolean> {
  try {
    const raw = await connection.get(keyExhaustedKey(keyIndex));
    if (!raw) return false;
    const resetAt = Number.parseInt(raw, 10);
    return Number.isFinite(resetAt) && resetAt > Math.floor(Date.now() / 1000);
  } catch {
    return false; // assume not exhausted on Redis failure
  }
}

/**
 * Return the index of the first API key that still has daily quota remaining,
 * or -1 if every configured key is exhausted.
 */
export async function getActiveKeyIndex(): Promise<number> {
  const keys = config.geminiApiKeys;
  for (let i = 0; i < keys.length; i++) {
    if (!(await isKeyExhausted(i))) return i;
  }
  return -1;
}

export interface GeminiUsage {
  used: number;
  limit: number;
  remaining: number;
  estimatedPagesRemaining: number;
  exhausted: boolean;
  resetsInSeconds: number | null;
}

/** Read the current day's Gemini usage snapshot (never throws). */
export async function getGeminiUsage(): Promise<GeminiUsage> {
  let used = 0;
  const keyCount = config.geminiApiKeys.length || 1;
  const nowSec = Math.floor(Date.now() / 1000);

  try {
    // Fetch the global usage counter and all per-key exhaustion markers in one round-trip.
    const keys = [usedKey(), ...Array.from({ length: keyCount }, (_, i) => keyExhaustedKey(i))];
    const results = await connection.mget(...keys);
    used = results[0] ? Number.parseInt(results[0], 10) || 0 : 0;

    // A key is "live" if it has no exhausted marker or its reset time has passed.
    // The whole pool is exhausted only when every key is exhausted.
    let allExhausted = keyCount > 0;
    let earliestReset: number | null = null;

    for (let i = 0; i < keyCount; i++) {
      const raw = results[i + 1];
      if (!raw) {
        allExhausted = false;
        continue;
      }
      const resetAt = Number.parseInt(raw, 10);
      const stillExhausted = Number.isFinite(resetAt) && resetAt > nowSec;
      if (!stillExhausted) {
        allExhausted = false;
      } else if (earliestReset === null || resetAt < earliestReset) {
        earliestReset = resetAt;
      }
    }

    const exhausted = allExhausted;
    const resetsInSeconds = exhausted && earliestReset !== null ? earliestReset - nowSec : null;
    const remaining = exhausted ? 0 : Math.max(0, GEMINI_DAILY_LIMIT * keyCount - used);
    const estimatedPagesRemaining = Math.round((remaining * CHARS_PER_REQUEST) / CHARS_PER_PAGE);

    return {
      used,
      limit: GEMINI_DAILY_LIMIT * keyCount,
      remaining,
      estimatedPagesRemaining,
      exhausted,
      resetsInSeconds,
    };
  } catch {
    /* best-effort — return zeros on Redis failure */
    return {
      used: 0,
      limit: GEMINI_DAILY_LIMIT * keyCount,
      remaining: GEMINI_DAILY_LIMIT * keyCount,
      estimatedPagesRemaining: Math.round((GEMINI_DAILY_LIMIT * keyCount * CHARS_PER_REQUEST) / CHARS_PER_PAGE),
      exhausted: false,
      resetsInSeconds: null,
    };
  }
}
