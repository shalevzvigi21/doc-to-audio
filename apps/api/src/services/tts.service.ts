import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpeg from "fluent-ffmpeg";
import { config } from "../config.js";
import { incrementGeminiUsage, markKeyExhausted, getActiveKeyIndex } from "./tts-usage.service.js";

/**
 * Text-to-speech via the Gemini API (Google AI Studio key).
 *
 * The model returns raw PCM audio (16-bit signed, mono) which we concatenate
 * across chunks and encode to MP3 with ffmpeg, then probe for duration with
 * ffprobe. Hebrew is produced automatically from the Hebrew input text — the
 * Gemini TTS voices are multilingual and detect the spoken language from the
 * content.
 */

// NOTE: the 2.5 TTS preview models (gemini-2.5-flash-preview-tts /
// gemini-2.5-pro-preview-tts) stopped producing Hebrew audio — they return
// `finishReason: OTHER` with no audio for any Hebrew input (English still
// works). The 3.1 TTS model handles Hebrew correctly. Verify Hebrew output
// before changing this back.
const MODEL = "gemini-3.1-flash-tts-preview";
/** One of Gemini's prebuilt multilingual voices. */
const VOICE_NAME = "Charon";
/** Default PCM sample rate Gemini returns (audio/L16;rate=24000). */
export const DEFAULT_SAMPLE_RATE = 24000;
/**
 * Keep each TTS request comfortably within model limits. The Gemini TTS preview
 * model caps audio output per request: chunks much larger than this come back
 * with `finishReason: OTHER` and NO audio, which fails the job. 4800 is proven
 * safe across dense Hebrew pages — do not raise without re-testing the endpoint.
 */
const MAX_CHARS = 4800;

const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/**
 * Prepended to every TTS request to nudge Gemini toward a steady narration
 * pace. Identical wording on every chunk keeps the instruction deterministic.
 * The model treats the leading English directive as delivery guidance and does
 * not speak it aloud in the Hebrew audio.
 */
const STYLE_DIRECTIVE =
  "Read the following text aloud at a slow, steady, even, constant pace, without speeding up or slowing down:\n\n";

/**
 * Split text into chunks of at most `maxChars`, breaking on sentence
 * boundaries. Sentences longer than the limit are hard-split on whitespace.
 */
export function splitIntoChunks(text: string, maxChars = MAX_CHARS): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  // Keep terminal punctuation with each sentence; treat newlines as breaks too.
  const sentences = normalized.match(/[^.!?\n]+[.!?]*\n*|\n+/g) ?? [normalized];

  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
    current = "";
  };

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxChars) {
      flush();

      if (sentence.length > maxChars) {
        // Hard-split an over-long sentence on word boundaries.
        const words = sentence.split(/(\s+)/);
        for (const word of words) {
          if (current.length + word.length > maxChars) flush();
          current += word;
        }
        continue;
      }
    }
    current += sentence;
  }
  flush();

  return chunks.filter((c) => c.length > 0);
}

interface GeminiPcm {
  pcm: Buffer;
  sampleRate: number;
}

/**
 * Max attempts per chunk. The free tier allows only 100 TTS requests PER DAY
 * (`generate_requests_per_model_per_day`), so every retry is precious — 8×
 * retries on a stubborn chunk could burn the entire daily budget on one bad
 * page. After sanitizeChunk() removes the Latin artifacts that caused most
 * false `PROHIBITED_CONTENT` blocks, real Hebrew usually passes on the first
 * try, so a single quick retry is enough to ride out the rare flaky block.
 */
const MAX_TTS_ATTEMPTS = 2;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sentinel: the request was rate-limited (HTTP 429) or hit a transient 5xx. */
const RATE_LIMITED = Symbol("rate-limited");

/**
 * Thrown when Gemini returns a 429 for the **per-day** free-tier cap
 * (`generate_requests_per_model_per_day`, limit 100). Unlike a per-minute
 * spike this will not recover for hours, so retrying or continuing only wastes
 * effort — we abort the whole conversion and surface a clear, actionable
 * message (with the API-reported reset time) instead.
 */
export class DailyQuotaError extends Error {
  constructor(public readonly retryIn?: string) {
    super(
      `Daily Gemini TTS quota (100 requests/day on the free tier) is exhausted.` +
        (retryIn ? ` Resets in ${retryIn}.` : ""),
    );
    this.name = "DailyQuotaError";
  }
}

/**
 * Pull the reset delay (seconds) out of a 429 body. Prefers the machine field
 * `"retryDelay": "27665s"`; falls back to the human "Please retry in 7h41m5s".
 */
function parseRetrySeconds(body: string): number | null {
  const machine = /"retryDelay"\s*:\s*"(\d+)s"/i.exec(body);
  if (machine) return Number(machine[1]);

  const human = /Please retry in (?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?/i.exec(body);
  if (human && (human[1] || human[2] || human[3])) {
    const h = Number(human[1] ?? 0);
    const m = Number(human[2] ?? 0);
    const s = Number(human[3] ?? 0);
    return Math.round(h * 3600 + m * 60 + s);
  }
  return null;
}

/**
 * Global request-rate gate. The Gemini free tier allows ~15 TTS requests per
 * minute. The recursive splitter and parallel batches can otherwise burst far
 * past that, triggering a 429 cascade that starves every chunk — including
 * clean Hebrew — so the whole document fails. Spacing every request at least
 * MIN_REQUEST_INTERVAL_MS apart caps the effective rate under the quota no
 * matter how many chunks/splits/retries are in flight. ~4.5s ≈ 13 req/min,
 * just under the 15 RPM cap. The shared `nextRequestAt` cursor serializes
 * request *starts* across all concurrent callers.
 */
const MIN_REQUEST_INTERVAL_MS = 4500;
let nextRequestAt = 0;
async function rateLimitGate(): Promise<void> {
  const now = Date.now();
  const startAt = Math.max(now, nextRequestAt);
  nextRequestAt = startAt + MIN_REQUEST_INTERVAL_MS;
  const wait = startAt - now;
  if (wait > 0) await sleep(wait);
}

/** Issue a single Gemini TTS request and parse out the PCM payload. */
async function requestChunk(text: string): Promise<GeminiPcm | typeof RATE_LIMITED | null> {
  await rateLimitGate();

  // Pick the first API key that still has daily quota. If all keys are
  // exhausted we throw immediately so the worker surfaces a clear error.
  const keyIndex = await getActiveKeyIndex();
  if (keyIndex === -1) {
    throw new DailyQuotaError();
  }
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
        contents: [{ parts: [{ text: STYLE_DIRECTIVE + text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_NAME } },
          },
        },
      }),
    });
  } catch {
    // Network-level error (ECONNRESET, DNS failure, etc.) before any HTTP
    // response — treat as transient and retry with the same backoff as 429.
    return RATE_LIMITED;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) {
      // Distinguish the per-DAY free-tier cap from a transient per-minute spike.
      if (/per_?day|PerDay|RequestsPerDay/i.test(body)) {
        const resetSeconds = parseRetrySeconds(body);
        await markKeyExhausted(keyIndex, resetSeconds);
        console.info(`[tts] key[${keyIndex}] daily quota exhausted — rotating to next key`);
        // Recurse: getActiveKeyIndex() will now skip this key and pick the next.
        // If no key is left, the recursive call throws DailyQuotaError.
        return requestChunk(text);
      }
      return RATE_LIMITED; // per-minute spike — transient, retry with backoff
    }
    if (res.status >= 500) return RATE_LIMITED;
    throw new Error(`Gemini TTS request failed (${res.status}): ${body}`);
  }

  // The API processed this request (200) — count it against the daily budget,
  // whether or not it returned audio (a content block still consumes quota).
  void incrementGeminiUsage();

  const data = (await res.json()) as {
    promptFeedback?: { blockReason?: string };
    candidates?: Array<{
      finishReason?: string;
      content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
    }>;
  };

  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  const base64 = part?.inlineData?.data;
  if (!base64) {
    // No audio. Usually a flaky safety block (`PROHIBITED_CONTENT`) or an empty
    // generation (`finishReason: OTHER`) — both clear on retry.
    const reason = data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason ?? "empty";
    console.warn(`[tts] no audio for chunk (reason: ${reason}) — retrying`);
    return null; // retry
  }

  // mimeType looks like "audio/L16;rate=24000" — pull out the sample rate.
  const rateMatch = /rate=(\d+)/.exec(part?.inlineData?.mimeType ?? "");
  const sampleRate = rateMatch ? Number(rateMatch[1]) : DEFAULT_SAMPLE_RATE;

  return { pcm: Buffer.from(base64, "base64"), sampleRate };
}

/**
 * Below this length we stop sub-dividing a stubbornly-blocked segment and just
 * skip it. Keeps a single un-synthesizable sentence from failing a whole doc.
 */
const MIN_SPLIT_CHARS = 280;

/** Backoff after a 429/5xx so a rate-limit can't cascade into a request storm. */
const RATE_LIMIT_BACKOFF_MS = 8000;

/**
 * Strip Latin letter sequences from Hebrew-primary text chunks before the API
 * call. Tesseract (lang: heb+eng) systematically misreads Hebrew glyphs as
 * Latin capitals — ג→G, א→A, י→Y, ר→R — producing sequences like "GAY",
 * "EE", "ARERR" scattered throughout real Hebrew prose. Gemini's safety
 * classifier fires PROHIBITED_CONTENT on these embedded English words
 * consistently, across all 8 retries and all recursive split levels. Removing
 * Latin from Hebrew-primary chunks leaves pure Hebrew that the classifier
 * accepts. For English-primary text (latinLetters >= hebrewLetters) the
 * function returns the text unchanged so English documents are unaffected.
 */
function sanitizeChunk(text: string): string {
  const hebrewLetters = (text.match(/[֐-׿יִ-פֿ]/gu) ?? []).length;
  const latinLetters = (text.match(/[A-Za-z]/g) ?? []).length;
  if (hebrewLetters <= latinLetters) return text;

  return text
    .replace(/\|/g, " ")         // pipe = OCR table-separator artifact
    .replace(/[A-Za-z]+/g, " ")  // all Latin sequences → space
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Heuristic gate: is this segment real, speakable prose — or OCR garbage?
 *
 * Scanned documents routinely yield mojibake: isolated letters, digits and
 * symbols ("5 - תה = 6 ם= n ה 5 תים"). Sending that to Gemini wastes an API
 * call, reliably trips the `PROHIBITED_CONTENT` safety filter, and (because a
 * block triggers recursive splitting + retries) can snowball into a rate-limit
 * storm that starves the genuinely-clean pages. We drop such segments up front.
 */
function isSpeakable(text: string): boolean {
  const stripped = text.replace(/\s+/g, " ").trim();
  if (stripped.length < 8) return false;

  // Ratio of real letters (Hebrew or Latin) to all non-space characters.
  const letters = (stripped.match(/[\p{Script=Hebrew}A-Za-z]/gu) ?? []).length;
  const nonSpace = stripped.replace(/\s/g, "").length;
  if (nonSpace === 0) return false;
  const letterRatio = letters / nonSpace;

  // Fraction of "words" that are a single character — isolated-letter noise.
  const words = stripped.split(" ");
  const singleRatio = words.filter((w) => w.length === 1).length / words.length;

  // Real prose is mostly letters with few isolated single-character tokens.
  return letterRatio >= 0.6 && singleRatio <= 0.4;
}

/**
 * Call Gemini for one text segment, retrying when it returns no audio or a
 * transient error. The failure return distinguishes the two cases so the
 * caller can react correctly:
 *   - `RATE_LIMITED` — every attempt hit a 429/5xx; the quota is saturated.
 *     Splitting would only multiply requests, so the caller must NOT subdivide.
 *   - `null` — a genuine content block; the caller can subdivide to isolate
 *     and skip the stuck sentence.
 */
async function synthesizeSegment(text: string): Promise<Buffer | typeof RATE_LIMITED | null> {
  let sawRateLimit = false;
  for (let attempt = 1; attempt <= MAX_TTS_ATTEMPTS; attempt++) {
    const result = await requestChunk(text);
    if (result && result !== RATE_LIMITED) return result.pcm;
    if (result === RATE_LIMITED) sawRateLimit = true;
    if (attempt < MAX_TTS_ATTEMPTS) {
      // Rate-limits get a long backoff so the free-tier quota can recover;
      // flaky safety blocks get a short capped backoff to ride out the streak.
      // Jitter decorrelates parallel retries from the same block/limit window.
      const base = result === RATE_LIMITED ? RATE_LIMIT_BACKOFF_MS : Math.min(750 * attempt, 3000);
      await sleep(base + Math.floor(Math.random() * 500));
    }
  }
  // If any attempt was rate-limited, report that (don't let the caller split).
  return sawRateLimit ? RATE_LIMITED : null;
}

/** Split text near its midpoint, preferring a sentence/whitespace boundary. */
function splitInHalf(text: string): [string, string] {
  const mid = Math.floor(text.length / 2);
  // Search outward from the midpoint for a sentence end, then any whitespace.
  for (const re of [/[.!?\n]/, /\s/]) {
    for (let off = 0; off < text.length / 2; off++) {
      for (const i of [mid + off, mid - off]) {
        if (i > 0 && i < text.length - 1 && re.test(text[i])) {
          return [text.slice(0, i + 1).trim(), text.slice(i + 1).trim()];
        }
      }
    }
  }
  return [text.slice(0, mid), text.slice(mid)];
}

/**
 * Synthesize one chunk resiliently. Gemini's safety classifier intermittently
 * (and wrongly) blocks benign Hebrew with `PROHIBITED_CONTENT`. When a segment
 * stays blocked through all retries we split it in half and try each half —
 * smaller text usually passes and any truly stuck sentence gets isolated and
 * skipped — so one bad segment never fails the whole document.
 *
 * @returns the concatenated PCM for the chunk (empty Buffer if every segment
 *          had to be skipped).
 */
async function synthesizeChunkResilient(text: string): Promise<Buffer> {
  // Strip Latin OCR artifacts (Tesseract misreadings of Hebrew glyphs) from
  // Hebrew-primary text. These embedded English sequences trip Gemini's safety
  // classifier with PROHIBITED_CONTENT on every retry. Cleaning first leaves
  // pure Hebrew that the classifier accepts.
  const cleaned = sanitizeChunk(text);

  if (!isSpeakable(cleaned)) {
    console.warn(`[tts] skipping unreadable segment (${text.length} chars): "${text.slice(0, 60)}…"`);
    return Buffer.alloc(0);
  }

  const result = await synthesizeSegment(cleaned);
  if (result instanceof Buffer) return result;

  // Rate-limited even after all retries: the free-tier quota is saturated.
  // Splitting would multiply requests and make the storm worse, so skip this
  // segment rather than amplify. The global rate gate makes this rare; if the
  // whole document is rate-limited, the final all-empty check fails the job
  // with a clear error.
  if (result === RATE_LIMITED) {
    console.warn(`[tts] skipping rate-limited segment (${text.length} chars) — quota saturated`);
    return Buffer.alloc(0);
  }

  // Genuine content block: isolate it by splitting; skip if already small.
  if (cleaned.length <= MIN_SPLIT_CHARS) {
    console.warn(`[tts] skipping un-synthesizable segment (${text.length} chars): "${text.slice(0, 60)}…"`);
    return Buffer.alloc(0);
  }

  const [left, right] = splitInHalf(cleaned);
  const [leftPcm, rightPcm] = await Promise.all([
    synthesizeChunkResilient(left),
    synthesizeChunkResilient(right),
  ]);
  return Buffer.concat([leftPcm, rightPcm]);
}

/** Encode raw 16-bit mono PCM to MP3 with ffmpeg. */
function pcmToMp3(pcmPath: string, sampleRate: number, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(pcmPath)
      .inputOptions(["-f s16le", `-ar ${sampleRate}`, "-ac 1"])
      .audioCodec("libmp3lame")
      .audioBitrate("128k")
      .format("mp3")
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .save(outputPath);
  });
}

/** Probe an audio file with ffprobe and return its duration in seconds. */
function getDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration ?? 0);
    });
  });
}

/**
 * Concatenate raw 16-bit-mono PCM buffers, encode once to an MP3 at
 * `outputPath`, and return its duration in seconds. Shared by every provider
 * (each produces PCM at `DEFAULT_SAMPLE_RATE`).
 */
export async function encodePcmToMp3(
  pcmBuffers: Buffer[],
  outputPath: string,
  sampleRate = DEFAULT_SAMPLE_RATE,
): Promise<number> {
  const workDir = await mkdtemp(path.join(tmpdir(), "doc2audio-tts-"));
  try {
    const pcmPath = path.join(workDir, "audio.pcm");
    await writeFile(pcmPath, Buffer.concat(pcmBuffers));

    await mkdir(path.dirname(outputPath), { recursive: true });
    await pcmToMp3(pcmPath, sampleRate, outputPath);

    return await getDuration(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Synthesize `text` to an MP3 at `outputPath` using the Gemini API.
 *
 * 1. Split into <=4800-char, sentence-aligned chunks.
 * 2. Synthesize each chunk to PCM via Gemini.
 * 3. Concatenate the PCM, encode once to MP3 with ffmpeg.
 * 4. Probe the duration with ffprobe.
 *
 * @returns the audio duration in seconds.
 */
export async function synthesizeGemini(
  text: string,
  outputPath: string,
  onProgress?: (fraction: number) => void | Promise<void>,
): Promise<number> {
  if (config.geminiApiKeys.length === 0) {
    throw new Error("No Gemini API keys configured (set GEMINI_API_KEYS or GEMINI_API_KEY)");
  }

  const chunks = splitIntoChunks(text);
  if (chunks.length === 0) {
    throw new Error("Cannot synthesize empty text");
  }

  // Synthesize chunks in parallel batches so TTS wall-time is ~PARALLEL_CHUNKS× faster.
  // Order is preserved by writing into a pre-sized array keyed by chunk index.
  // Kept at 2 (not higher) so retry storms from flaky safety blocks don't blow
  // through the Gemini free-tier rate limit.
  const PARALLEL_CHUNKS = 2;
  const pcmBuffers = new Array<Buffer>(chunks.length);
  let completed = 0;

  for (let start = 0; start < chunks.length; start += PARALLEL_CHUNKS) {
    const batchIndices = Array.from(
      { length: Math.min(PARALLEL_CHUNKS, chunks.length - start) },
      (_, j) => start + j,
    );
    await Promise.all(
      batchIndices.map(async (i) => {
        pcmBuffers[i] = await synthesizeChunkResilient(chunks[i]);
        completed++;
        await onProgress?.(completed / chunks.length);
      }),
    );
  }

  // Only fail if the entire document came back empty; a few skipped segments
  // are tolerated so one stuck sentence can't sink a whole conversion.
  if (pcmBuffers.every((b) => b.length === 0)) {
    throw new Error("Gemini TTS produced no audio for any chunk");
  }

  return encodePcmToMp3(pcmBuffers, outputPath);
}
