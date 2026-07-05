import path from "node:path";
import { rm } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Worker, type Job } from "bullmq";
import { connection } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";
import { CONVERSION_QUEUE_NAME } from "../config.js";
import type { ConversionJobData } from "../queue/conversionQueue.js";
import { extractTextPages } from "../services/ocr.service.js";
import { reconstructPageColumns } from "../services/text-reconstruction.service.js";
import { cleanTextForReading } from "../services/text-cleaner.service.js";
import { synthesizeGemini, DailyQuotaError } from "../services/tts.service.js";
import { synthesizeAzure } from "../services/azure-tts.service.js";
import { downloadToTemp, uploadLocalFile } from "../services/storage.service.js";

/**
 * Process a single document → audio conversion:
 *   1. mark the File PROCESSING
 *   2. OCR the source document to text
 *   3. synthesize speech to uploads/{userId}/audio/{fileId}.mp3
 *   4. upsert the AudioJob with the audio path + duration
 *   5. mark the File DONE
 * On any failure the File is flipped to ERROR, the full error is logged, and
 * the error is re-thrown so BullMQ can retry.
 */
async function processConversion(job: Job<ConversionJobData>): Promise<void> {
  const { fileId, userId, provider = "gemini", reconstructColumns = false } = job.data;

  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file) {
    throw new Error(`File ${fileId} not found`);
  }

  await prisma.file.update({ where: { id: fileId }, data: { status: "PROCESSING" } });

  // Persist a 0–100 progress value the player page polls. Writes are coarse
  // (one per page / per chunk), so a direct update per step is fine.
  const setProgress = async (percent: number): Promise<void> => {
    await prisma.audioJob
      .update({ where: { fileId }, data: { progress: Math.round(percent) } })
      .catch(() => undefined);
  };

  // Temp paths that must be cleaned up in finally.
  let localSourcePath: string | null = null;
  let localMp3Path: string | null = null;

  try {
    await setProgress(0);

    // Download source file to local temp so OCR can read it.
    const ext = path.extname(file.path) || path.extname(file.name) || ".pdf";
    localSourcePath = await downloadToTemp(file.path, ext);

    // OCR occupies 0–60% (with reconstruction) or 0–70% (without) of the bar.
    const ocrCeiling = reconstructColumns ? 60 : 70;
    const pages = await extractTextPages(localSourcePath, (f) => setProgress(f * ocrCeiling));

    // Optionally reorder multi-column layouts (60–70%). Reconstruction is an
    // enhancement — on any failure (block, quota, error) fall back to the raw
    // OCR text so the conversion still produces audio.
    let rawText: string;
    if (reconstructColumns) {
      try {
        const reconstructed = await reconstructPageColumns(pages, (f) => setProgress(60 + f * 10));
        rawText = reconstructed.join("\n\n");
      } catch (err) {
        console.warn(`[conversion] column reconstruction failed for ${fileId} — using raw OCR:`, err);
        rawText = pages.join("\n\n");
      }
    } else {
      rawText = pages.join("\n\n");
    }

    if (!rawText || rawText.trim().length === 0) {
      throw new Error("No text could be extracted from the document");
    }

    // Strip non-narrative content (citations, reference section, page numbers,
    // URLs) so the audio flows naturally without interruptions.
    const text = cleanTextForReading(rawText);
    if (!text) {
      throw new Error("No readable text remained after cleaning");
    }

    // ...speech synthesis occupies 70–95%. Write MP3 to a local temp file,
    // then upload it to storage (R2 or local final path).
    const tmpWorkDir = await mkdtemp(path.join(tmpdir(), "doc2audio-mp3-"));
    localMp3Path = path.join(tmpWorkDir, `${fileId}.mp3`);

    const duration = provider === "azure"
      ? await synthesizeAzure(text, localMp3Path, (f) => setProgress(70 + f * 25))
      : await synthesizeGemini(text, localMp3Path, (f) => setProgress(70 + f * 25));

    // Upload MP3 to storage and get back the path/key to store in DB.
    const audioStorageKey = `audio/${userId}/${fileId}.mp3`;
    const audioPath = await uploadLocalFile(localMp3Path, audioStorageKey, "audio/mpeg");
    localMp3Path = null; // uploadLocalFile moves the file; nothing left to clean up

    await prisma.audioJob.upsert({
      where: { fileId },
      create: { fileId, audioPath, duration, progress: 100 },
      update: { audioPath, duration, progress: 100 },
    });

    await prisma.file.update({ where: { id: fileId }, data: { status: "DONE" } });

    console.log(
      `[conversion] file ${fileId} done — ${duration.toFixed(1)}s (${file.name})`,
    );
  } catch (err) {
    await prisma.file
      .update({ where: { id: fileId }, data: { status: "ERROR" } })
      .catch(() => undefined);
    console.error(`[conversion] file ${fileId} failed:`, err);

    if (err instanceof DailyQuotaError) {
      console.error(`[conversion] daily Gemini quota exhausted — not retrying. ${err.message}`);
      return;
    }
    throw err;
  } finally {
    // Clean up any local temp files that weren't consumed by uploadLocalFile.
    if (localSourcePath) await rm(path.dirname(localSourcePath), { recursive: true, force: true }).catch(() => undefined);
    if (localMp3Path) await rm(path.dirname(localMp3Path), { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Create and start the conversion worker. Uses a dedicated (duplicated) Redis
 * connection so BullMQ's blocking commands don't contend with the queue's
 * connection. Returns the Worker so the caller can close it on shutdown.
 */
export function startConversionWorker(): Worker<ConversionJobData> {
  const worker = new Worker<ConversionJobData>(CONVERSION_QUEUE_NAME, processConversion, {
    connection: connection.duplicate(),
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
    stalledInterval: 15_000,  // re-queue stalled jobs every 15s (default: 30s)
    lockDuration: 30_000,     // lock expires after 30s if worker dies
    lockRenewTime: 10_000,    // renew lock every 10s to stay alive
  });

  worker.on("completed", (job) => {
    console.log(`[conversion] completed job ${job.id}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[conversion] failed job ${job?.id}:`, err.message);
  });

  console.log(`[conversion] worker listening on queue "${CONVERSION_QUEUE_NAME}" (tts: multi-provider gemini+azure)`);
  return worker;
}
