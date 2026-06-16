import { Redis } from "ioredis";
import { config } from "../config.js";

/**
 * Shared ioredis connection for BullMQ.
 * `maxRetriesPerRequest: null` is required by BullMQ for blocking commands.
 */
export const connection = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

connection.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("[redis] connection error:", err.message);
});
