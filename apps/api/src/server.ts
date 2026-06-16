import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { config } from "./config.js";
import authPlugin from "./plugins/auth.js";
import authRoutes from "./routes/auth.js";
import filesRoutes from "./routes/files.js";
import foldersRoutes from "./routes/folders.js";
import jobsRoutes from "./routes/jobs.js";
import audioRoutes from "./routes/audio.js";
import ttsRoutes from "./routes/tts.js";

/** Build and configure the Fastify instance (without starting to listen). */
export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      transport:
        process.env.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
          : undefined,
    },
    bodyLimit: 10 * 1024 * 1024,
  });

  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });

  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50 MB max document
      files: 1,
    },
  });

  // Auth plugin installs the global onRequest guard (skips /auth/* and /health).
  await app.register(authPlugin);

  app.get("/health", async () => ({ status: "ok", uptime: process.uptime() }));

  await app.register(authRoutes);
  await app.register(filesRoutes);
  await app.register(foldersRoutes);
  await app.register(jobsRoutes);
  await app.register(audioRoutes);
  await app.register(ttsRoutes);

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const statusCode = error.statusCode ?? 500;
    reply.code(statusCode).send({
      statusCode,
      error: error.name ?? "Internal Server Error",
      message:
        statusCode >= 500 ? "An unexpected error occurred" : error.message ?? "Request failed",
    });
  });

  return app;
}
