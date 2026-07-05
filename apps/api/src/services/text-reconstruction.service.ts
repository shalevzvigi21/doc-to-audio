import { config } from "../config.js";
import {
  incrementGeminiUsage,
  markKeyExhausted,
  getActiveKeyIndex,
  geminiRateGate,
} from "./tts-usage.service.js";
import { DailyQuotaError, parseRetrySeconds } from "./tts.service.js";

/**
 * Multi-column Hebrew OCR reconstruction via the Gemini text API.
 *
 * Tesseract reads a multi-column page (newspaper/journal) horizontally across
 * the whole width, unnaturally stitching a sentence from the right column onto
 * an unrelated sentence from the left column on the same physical line. This
 * service sends each page's raw OCR text to a Gemini text model that restores
 * the correct RTL reading order (headline → full right column → full left
 * column) without altering the words.
 *
 * Reconstruction is an *enhancement*: any page that can't be reconstructed
 * (safety block, empty response, transient error) passes through unchanged so
 * no content is ever lost. A genuine per-day quota 429 throws DailyQuotaError
 * so the worker can fall back to the raw OCR text for the whole document.
 */

const MODEL = config.geminiTextModel;
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/** The specialized reconstruction instruction (sent as the system prompt). */
const SYSTEM_PROMPT = `You are an advanced text-reconstruction engine specializing in Hebrew typography and multi-column newspaper layouts.

The user will provide you with raw text extracted from a Hebrew document (OCR). Due to a multi-column layout, the raw extraction is corrupted: it reads horizontally across the page, unnaturally stitching together sentences from the right column with unrelated sentences from the left column on the same horizontal line.

Your objective is to reconstruct the exact original reading order using semantic logic and Hebrew syntax.

Follow these strict rules:
1. Identify Full-Width Elements: Headlines and sub-headlines span the entire width. Keep them at the very top of the output.
2. Semantic Boundary Detection: Read the corrupted horizontal lines. Use your understanding of Hebrew grammar and context to identify the exact point where a sentence unnaturally breaks and switches to an unrelated topic. This point marks the invisible boundary between the right and left columns.
3. RTL Column Reconstruction: Since Hebrew is read Right-to-Left, isolate all the fragmented sentences belonging to the Right column and reconstruct them vertically into coherent paragraphs. Then, do the same for the Left column.
4. Logical Stitching: Ensure that when the bottom of the right column is reached, the narrative flows logically into the top of the left column.
5. Absolute Fidelity: Do not summarize, add, or alter the meaning of the text. Fix ONLY the structural reading order.

Output strictly the final, correctly ordered Hebrew text. Do not include any explanations or conversational text.`;

/** Per-page attempts: one request plus one quick retry for transient failures. */
const MAX_ATTEMPTS = 2;
/** Reconstruct a few pages at a time; the shared rate gate keeps us under RPM. */
const PAGE_CONCURRENCY = 3;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Sentinel: the request was rate-limited (per-minute 429 / transient 5xx). */
const RATE_LIMITED = Symbol("rate-limited");

/**
 * Issue one Gemini text request for a single page. Returns the reconstructed
 * text, RATE_LIMITED for a transient failure, or null for a content block /
 * empty response. Throws DailyQuotaError when the per-day cap is hit.
 */
async function requestPage(text: string): Promise<string | typeof RATE_LIMITED | null> {
  await geminiRateGate();

  const keyIndex = await getActiveKeyIndex();
  if (keyIndex === -1) throw new DailyQuotaError();
  const apiKey = config.geminiApiKeys[keyIndex];

  let res: Response;
  try {
    res = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text }] }],
        // Deterministic output preserves fidelity — no creative rewriting.
        generationConfig: { temperature: 0 },
      }),
    });
  } catch {
    // Network-level error before any HTTP response — treat as transient.
    return RATE_LIMITED;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) {
      if (/per_?day|PerDay|RequestsPerDay/i.test(body)) {
        const resetSeconds = parseRetrySeconds(body);
        await markKeyExhausted(keyIndex, resetSeconds);
        console.info(`[reconstruct] key[${keyIndex}] daily quota exhausted — rotating to next key`);
        // Recurse: getActiveKeyIndex() now skips this key. Throws if none left.
        return requestPage(text);
      }
      return RATE_LIMITED; // per-minute spike — transient, retry with backoff
    }
    if (res.status >= 500) return RATE_LIMITED;
    throw new Error(`Gemini reconstruction request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  // The API processed this request (200) — count it against the daily budget.
  void incrementGeminiUsage();

  const data = (await res.json().catch(() => null)) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  } | null;

  const out = data?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();

  return out && out.length > 0 ? out : null;
}

/**
 * Reconstruct one page, retrying transient failures. On a genuine block/empty
 * result or a saturated rate limit, returns the original page unchanged so no
 * content is lost.
 */
async function reconstructOne(page: string): Promise<string> {
  if (!page.trim()) return page;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await requestPage(page);
    if (typeof result === "string") return result;
    if (result === RATE_LIMITED && attempt < MAX_ATTEMPTS) {
      await sleep(4500 + Math.floor(Math.random() * 500));
      continue;
    }
    break;
  }

  console.warn(`[reconstruct] page not reconstructed (${page.length} chars) — using raw OCR text`);
  return page;
}

/**
 * Reconstruct every page's column order. Pages are processed in small parallel
 * batches with order preserved. A per-day quota error propagates so the caller
 * can fall back to raw OCR for the whole document.
 *
 * @returns the reconstructed pages, in order.
 */
export async function reconstructPageColumns(
  pages: string[],
  onProgress?: (fraction: number) => void | Promise<void>,
): Promise<string[]> {
  if (config.geminiApiKeys.length === 0) {
    throw new Error("No Gemini API keys configured (set GEMINI_API_KEYS or GEMINI_API_KEY)");
  }

  const out = new Array<string>(pages.length);
  let completed = 0;

  for (let start = 0; start < pages.length; start += PAGE_CONCURRENCY) {
    const batchIndices = Array.from(
      { length: Math.min(PAGE_CONCURRENCY, pages.length - start) },
      (_, j) => start + j,
    );
    await Promise.all(
      batchIndices.map(async (i) => {
        out[i] = await reconstructOne(pages[i]);
        completed++;
        await onProgress?.(completed / pages.length);
      }),
    );
  }

  return out;
}
