import path from "node:path";
import { Worker, type Job } from "bullmq";
import { connection } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";
import { config, CONVERSION_QUEUE_NAME } from "../config.js";
import type { ConversionJobData } from "../queue/conversionQueue.js";
import { extractText } from "../services/ocr.service.js";
import { synthesizeGemini, DailyQuotaError } from "../services/tts.service.js";
import { synthesizeAzure } from "../services/azure-tts.service.js";

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
  const { fileId, userId, provider = "gemini", voice = "Charon" } = job.data;

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

  try {
    await setProgress(0);

    // OCR occupies 0–70% of the bar...
    const text = await extractText(file.path, (f) => setProgress(f * 70));
    if (!text || text.trim().length === 0) {
      throw new Error("No text could be extracted from the document");
    }

    // ...speech synthesis occupies 70–95%. Dispatch to the chosen TTS engine.
    const outputPath = path.join(config.uploadDir, userId, "audio", `${fileId}.mp3`);
    const duration = provider === "azure"
      ? await synthesizeAzure(text, outputPath, (f) => setProgress(70 + f * 25))
      : await synthesizeGemini(text, outputPath, (f) => setProgress(70 + f * 25), voice);

    await prisma.audioJob.upsert({
      where: { fileId },
      create: { fileId, audioPath: outputPath, duration, progress: 100 },
      update: { audioPath: outputPath, duration, progress: 100 },
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

    // The daily free-tier quota won't recover for hours, so retrying the job
    // (BullMQ `attempts`) would only re-run OCR and immediately 429 again,
    // wasting tomorrow's first requests. Swallow it so BullMQ does NOT retry.
    if (err instanceof DailyQuotaError) {
      console.error(`[conversion] daily Gemini quota exhausted — not retrying. ${err.message}`);
      return;
    }
    throw err;
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
