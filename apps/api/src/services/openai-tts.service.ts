import { config } from "../config.js";
import { redact } from "../lib/error-log.js";
import { splitIntoChunks, encodePcmToMp3, DEFAULT_SAMPLE_RATE } from "./tts.service.js";

/**
 * Text-to-speech via the OpenAI Audio API (`/v1/audio/speech`) — a third
 * engine next to Gemini and Azure. OpenAI has no tiny per-model daily request
 * cap like Gemini's preview TTS model, only normal per-minute limits.
 *
 * We request **raw 24kHz 16-bit mono PCM** (`response_format: "pcm"`) so the
 * audio reuses the shared `encodePcmToMp3` pipeline.
 */

/** The API accepts up to 4096 characters per request; stay safely under it. */
const OPENAI_MAX_CHARS = 3800;
/** Chunks synthesized at a time. */
const PARALLEL_CHUNKS = 2;
const MAX_ATTEMPTS = 5;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Narration style, only understood by the gpt-4o-* TTS models. */
const INSTRUCTIONS =
  "Read the Hebrew text aloud as a calm, clear audiobook narrator. Keep the same steady pace and tone throughout, " +
  "pronounce Hebrew naturally, and do not add or skip any words.";

async function openaiChunkToPcm(text: string): Promise<Buffer> {
  const body: Record<string, unknown> = {
    model: config.openaiTtsModel,
    voice: config.openaiTtsVoice,
    input: text,
    response_format: "pcm",
  };
  if (config.openaiTtsModel.startsWith("gpt-4o")) body.instructions = INSTRUCTIONS;

  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.openaiApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      lastError = `network error: ${(err as Error).message}`;
      await sleep(2000 * attempt);
      continue;
    }

    if (res.ok) return Buffer.from(await res.arrayBuffer());

    const detail = redact((await res.text().catch(() => "")).replace(/\s+/g, " ")).slice(0, 400);
    lastError = `HTTP ${res.status}: ${detail}`;

    // Hard failures (bad key, no credit, bad request) will not fix themselves.
    if (res.status === 401) throw new Error("OpenAI rejected the API key (401). Check OPENAI_API_KEY.");
    if (res.status === 402 || /insufficient_quota|billing/i.test(detail)) {
      throw new Error(`OpenAI account has no credit left (${detail})`);
    }
    if (res.status !== 429 && res.status < 500) {
      throw new Error(`OpenAI TTS request failed (${lastError})`);
    }
    // 429 (rate limit) / 5xx: back off and retry.
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * attempt ** 2);
  }
  throw new Error(`OpenAI TTS failed after ${MAX_ATTEMPTS} attempts (${lastError})`);
}

/**
 * Synthesize `text` to an MP3 at `outputPath` using OpenAI.
 * Mirrors `synthesizeAzure`: chunk → PCM (in parallel batches) → one MP3.
 * Any chunk that cannot be synthesized fails the job instead of leaving a gap.
 *
 * @returns the audio duration in seconds.
 */
export async function synthesizeOpenAI(
  text: string,
  outputPath: string,
  onProgress?: (fraction: number) => void | Promise<void>,
): Promise<number> {
  if (!config.openaiConfigured) {
    throw new Error("OpenAI TTS is not configured (OPENAI_API_KEY)");
  }

  const chunks = splitIntoChunks(text, OPENAI_MAX_CHARS);
  if (chunks.length === 0) throw new Error("Cannot synthesize empty text");

  const pcmBuffers = new Array<Buffer>(chunks.length);
  let completed = 0;

  for (let start = 0; start < chunks.length; start += PARALLEL_CHUNKS) {
    const batch = Array.from({ length: Math.min(PARALLEL_CHUNKS, chunks.length - start) }, (_, j) => start + j);
    await Promise.all(
      batch.map(async (i) => {
        pcmBuffers[i] = await openaiChunkToPcm(chunks[i]);
        completed++;
        await onProgress?.(completed / chunks.length);
      }),
    );
  }

  if (pcmBuffers.some((b) => b.length === 0)) {
    throw new Error("OpenAI TTS returned empty audio for a chunk");
  }

  return encodePcmToMp3(pcmBuffers, outputPath, DEFAULT_SAMPLE_RATE);
}
