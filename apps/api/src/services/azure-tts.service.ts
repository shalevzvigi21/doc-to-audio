import { config } from "../config.js";
import { splitIntoChunks, encodePcmToMp3, DEFAULT_SAMPLE_RATE } from "./tts.service.js";

/**
 * Text-to-speech via the Azure Speech REST API — the optional alternative to
 * Gemini, chosen per-conversion. Azure has no tiny daily request cap (free tier
 * F0 = 500k characters/month) and supports Hebrew neural voices, so it's the
 * fallback when the Gemini daily budget runs out.
 *
 * We request **raw 24kHz 16-bit mono PCM** so the audio reuses the exact same
 * `encodePcmToMp3` pipeline as Gemini (concatenate chunks → one MP3).
 */

/** Azure caps a single request to 10 minutes of audio; stay well under it. */
const AZURE_MAX_CHARS = 4000;
/** raw 24kHz/16-bit/mono PCM — matches DEFAULT_SAMPLE_RATE for the shared encoder. */
const AZURE_OUTPUT_FORMAT = "raw-24khz-16bit-mono-pcm";
/** Synthesize a couple of chunks at a time; Azure F0 allows ~20 req/min. */
const PARALLEL_CHUNKS = 2;

/** Escape text for inclusion in an SSML document. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Build the SSML body for one chunk using the configured Hebrew voice. */
function buildSsml(text: string): string {
  const voice = config.azureSpeechVoice;
  // Locale is the voice's prefix (e.g. "he-IL" from "he-IL-AvriNeural").
  const locale = voice.split("-").slice(0, 2).join("-") || "he-IL";
  // rate="0%" locks the voice to its default (neutral) speed. This is the
  // deterministic rate equivalent: Azure SSML guarantees a strictly constant
  // pace across every chunk, unlike Gemini's generative model.
  return (
    `<speak version="1.0" xml:lang="${locale}">` +
    `<voice name="${voice}"><prosody rate="0%">${escapeXml(text)}</prosody></voice>` +
    `</speak>`
  );
}

/** Synthesize a single chunk to raw PCM via Azure. Throws on a hard failure. */
async function azureChunkToPcm(text: string): Promise<Buffer> {
  const endpoint = `https://${config.azureSpeechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": config.azureSpeechKey,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": AZURE_OUTPUT_FORMAT,
      "User-Agent": "doc-to-audio",
    },
    body: buildSsml(text),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Azure TTS request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

/**
 * Synthesize `text` to an MP3 at `outputPath` using Azure Speech.
 * Mirrors `synthesizeGemini`: chunk → PCM (in parallel batches) → one MP3.
 *
 * @returns the audio duration in seconds.
 */
export async function synthesizeAzure(
  text: string,
  outputPath: string,
  onProgress?: (fraction: number) => void | Promise<void>,
): Promise<number> {
  if (!config.azureConfigured) {
    throw new Error("Azure Speech is not configured (AZURE_SPEECH_KEY / AZURE_SPEECH_REGION)");
  }

  const chunks = splitIntoChunks(text, AZURE_MAX_CHARS);
  if (chunks.length === 0) {
    throw new Error("Cannot synthesize empty text");
  }

  const pcmBuffers = new Array<Buffer>(chunks.length);
  let completed = 0;

  for (let start = 0; start < chunks.length; start += PARALLEL_CHUNKS) {
    const batchIndices = Array.from(
      { length: Math.min(PARALLEL_CHUNKS, chunks.length - start) },
      (_, j) => start + j,
    );
    await Promise.all(
      batchIndices.map(async (i) => {
        pcmBuffers[i] = await azureChunkToPcm(chunks[i]);
        completed++;
        await onProgress?.(completed / chunks.length);
      }),
    );
  }

  if (pcmBuffers.every((b) => b.length === 0)) {
    throw new Error("Azure TTS produced no audio for any chunk");
  }

  return encodePcmToMp3(pcmBuffers, outputPath, DEFAULT_SAMPLE_RATE);
}
