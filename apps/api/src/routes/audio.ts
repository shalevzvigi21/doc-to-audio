import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireUser, notFound } from "../lib/http.js";
import { getStorageStream } from "../services/storage.service.js";

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

    const range = request.headers.range;
    reply.header("Accept-Ranges", "bytes");
    reply.header("Content-Type", "audio/mpeg");
    reply.header("Cache-Control", "public, max-age=3600");

    try {
      if (range) {
        const match = /bytes=(\d*)-(\d*)/.exec(range);
        if (!match) {
          const { totalSize } = await getStorageStream(job.audioPath);
          return reply.code(416).header("Content-Range", `bytes */${totalSize}`).send();
        }
        const { totalSize } = await getStorageStream(job.audioPath);
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
        if (start >= totalSize || end >= totalSize || start > end) {
          return reply.code(416).header("Content-Range", `bytes */${totalSize}`).send();
        }
        const { stream, contentLength } = await getStorageStream(job.audioPath, { start, end });
        reply
          .code(206)
          .header("Content-Range", `bytes ${start}-${end}/${totalSize}`)
          .header("Content-Length", contentLength);
        return reply.send(stream);
      }

      const { stream, totalSize } = await getStorageStream(job.audioPath);
      reply.header("Content-Length", totalSize);
      return reply.send(stream);
    } catch {
      return notFound(reply, "Audio file is missing from storage");
    }
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

    const range = request.headers.range;
    reply.header("Accept-Ranges", "bytes");
    reply.header("Content-Type", "audio/mpeg");
    reply.header("Cache-Control", "private, max-age=0, must-revalidate");

    try {
      if (range) {
        const match = /bytes=(\d*)-(\d*)/.exec(range);
        if (!match) {
          const { totalSize } = await getStorageStream(job.audioPath);
          return reply.code(416).header("Content-Range", `bytes */${totalSize}`).send();
        }
        const { totalSize } = await getStorageStream(job.audioPath);
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
        if (start >= totalSize || end >= totalSize || start > end) {
          return reply.code(416).header("Content-Range", `bytes */${totalSize}`).send();
        }
        const { stream, contentLength } = await getStorageStream(job.audioPath, { start, end });
        reply
          .code(206)
          .header("Content-Range", `bytes ${start}-${end}/${totalSize}`)
          .header("Content-Length", contentLength);
        return reply.send(stream);
      }

      const { stream, totalSize } = await getStorageStream(job.audioPath);
      reply.header("Content-Length", totalSize);
      return reply.send(stream);
    } catch {
      return notFound(reply, "Audio file is missing from storage");
    }
  });
};

export default audioRoutes;
