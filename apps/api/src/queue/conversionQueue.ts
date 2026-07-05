import { Queue } from "bullmq";
import type { TtsProvider } from "@doc-to-audio/types";
import { connection } from "../lib/redis.js";
import { CONVERSION_QUEUE_NAME } from "../config.js";

export interface ConversionJobData {
  fileId: string;
  userId: string;
  /** Which TTS engine to use. Older queued jobs without this default to gemini. */
  provider?: TtsProvider;
  /** Reorder multi-column (newspaper) layouts via Gemini before TTS. Defaults to false. */
  reconstructColumns?: boolean;
}

/**
 * The BullMQ queue that the API pushes document→audio conversion jobs onto and
 * the in-process worker consumes.
 */
export const conversionQueue = new Queue<ConversionJobData>(CONVERSION_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 24 * 3600 },
  },
});
