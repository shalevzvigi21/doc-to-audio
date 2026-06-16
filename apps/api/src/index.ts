import { mkdir } from "node:fs/promises";
import { buildServer } from "./server.js";
import { config } from "./config.js";
import { startConversionWorker } from "./workers/conversion.worker.js";

async function main() {
  // Ensure the upload root exists before serving requests.
  await mkdir(config.uploadDir, { recursive: true });

  const app = await buildServer();

  // Start the BullMQ conversion worker in-process, alongside the HTTP server.
  const worker = startConversionWorker();

  try {
    await app.listen({ host: config.host, port: config.port });
    app.log.info(`API listening on http://${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    await worker.close();
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down...`);
    await worker.close();
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", err);
  process.exit(1);
});
