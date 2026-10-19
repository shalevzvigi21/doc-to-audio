import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireUser } from "../lib/http.js";
import { readUserErrors } from "../lib/error-log.js";
import { resolveGeminiContext } from "../services/gemini-keys.service.js";
import { getGeminiUsage } from "../services/tts-usage.service.js";

const diagnosticsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /me/diagnostics — what the "report a problem" button attaches: recent
   * conversion errors and file states for the signed-in user. Contains no
   * secrets (no keys, tokens or passwords) and no file contents.
   */
  fastify.get("/me/diagnostics", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;

    const [errors, files, ctx] = await Promise.all([
      readUserErrors(user.id),
      prisma.file.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { audioJob: { select: { progress: true, duration: true, updatedAt: true } } },
      }),
      resolveGeminiContext(user.id),
    ]);
    const usage = ctx ? await getGeminiUsage(ctx) : null;

    return reply.send({
      generatedAt: new Date().toISOString(),
      account: user.email ?? user.id,
      gemini: ctx
        ? { keySource: ctx.source, used: usage?.used, limit: usage?.limit, exhausted: usage?.exhausted }
        : { keySource: "none" },
      files: files.map((f) => ({
        name: f.name,
        type: f.mimeType,
        status: f.status,
        progress: f.audioJob?.progress ?? null,
        audioSeconds: f.audioJob?.duration ?? null,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.audioJob?.updatedAt?.toISOString() ?? null,
      })),
      errors,
    });
  });
};

export default diagnosticsRoutes;
