import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireUser, notFound } from "../lib/http.js";

/**
 * GET /audio/:jobId — stream the generated MP3 with HTTP range support so the
 * browser audio element can seek.
 */
const audioRoutes: FastifyPluginAsync = async (fastify) => {
  /** GET /audio/public/:jobId — unauthenticated stream for sharing */
  fastify.get<{ Params: { jobId: string } }>("/audio/public/:jobId", async (request, reply) => {
    const job = await prisma.audioJob.findFirst({
      where: { id: request.params.jobId },
    });
    if (!job || !job.audioPath) {
      return notFound(reply, "Audio not available");
    }

    let fileStat;
    try {
      fileStat = await stat(job.audioPath);
    } catch {
      return notFound(reply, "Audio file is missing on disk");
    }

    const total = fileStat.size;
    const range = request.headers.range;

    reply.header("Accept-Ranges", "bytes");
    reply.header("Content-Type", "audio/mpeg");
    reply.header("Cache-Control", "public, max-age=3600");

    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      if (!match) return reply.code(416).header("Content-Range", `bytes */${total}`).send();
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? parseInt(match[2], 10) : total - 1;
      if (start >= total || end >= total || start > end)
        return reply.code(416).header("Content-Range", `bytes */${total}`).send();
      const chunkSize = end - start + 1;
      reply.code(206).header("Content-Range", `bytes ${start}-${end}/${total}`).header("Content-Length", chunkSize);
      return reply.send(createReadStream(job.audioPath, { start, end }));
    }

    reply.header("Content-Length", total);
    return reply.send(createReadStream(job.audioPath));
  });

  /** GET /audio/:jobId — authenticated stream */
  fastify.get<{ Params: { jobId: string } }>("/audio/:jobId", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;

    const job = await prisma.audioJob.findFirst({
      where: { id: request.params.jobId, file: { userId: user.id } },
    });
    if (!job || !job.audioPath) {
      return notFound(reply, "Audio not available");
    }

    let fileStat;
    try {
      fileStat = await stat(job.audioPath);
    } catch {
      return notFound(reply, "Audio file is missing on disk");
    }

    const total = fileStat.size;
    const range = request.headers.range;

    reply.header("Accept-Ranges", "bytes");
    reply.header("Content-Type", "audio/mpeg");
    reply.header("Cache-Control", "private, max-age=0, must-revalidate");

    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      if (!match) {
        return reply
          .code(416)
          .header("Content-Range", `bytes */${total}`)
          .send();
      }

      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? parseInt(match[2], 10) : total - 1;

      if (start >= total || end >= total || start > end) {
        return reply
          .code(416)
          .header("Content-Range", `bytes */${total}`)
          .send();
      }

      const chunkSize = end - start + 1;
      reply
        .code(206)
        .header("Content-Range", `bytes ${start}-${end}/${total}`)
        .header("Content-Length", chunkSize);

      return reply.send(createReadStream(job.audioPath, { start, end }));
    }

    reply.header("Content-Length", total);
    return reply.send(createReadStream(job.audioPath));
  });
};

export default audioRoutes;
