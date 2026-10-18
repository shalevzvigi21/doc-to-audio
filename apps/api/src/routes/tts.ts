import type { FastifyPluginAsync } from "fastify";
import type { TtsQuotaResponse } from "@doc-to-audio/types";
import { config } from "../config.js";
import { getGeminiUsage } from "../services/tts-usage.service.js";
import { resolveGeminiContext } from "../services/gemini-keys.service.js";
import { prisma } from "../lib/prisma.js";
import { requireUser } from "../lib/http.js";

const ttsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /tts/quota — today's Gemini free-tier usage so the UI can show how many
   * pages are left and whether to switch to Azure. Usage is tracked per key:
   * the signed-in user's own Gemini key, or the server's shared key as a fallback.
   */
  fastify.get("/tts/quota", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;

    const ctx = await resolveGeminiContext(user.id);
    const gemini = ctx
      ? await getGeminiUsage(ctx)
      : { used: 0, limit: 0, remaining: 0, estimatedPagesRemaining: 0, exhausted: false, resetsInSeconds: null };
    const saved = ctx?.source === "user"
      ? await prisma.user.findUnique({ where: { id: user.id }, select: { geminiKeyLast4: true } })
      : null;
    const body: TtsQuotaResponse = {
      gemini,
      azureAvailable: config.azureConfigured,
      geminiKey: { source: ctx?.source ?? "none", last4: saved?.geminiKeyLast4 ?? null },
    };
    return reply.send(body);
  });
};

export default ttsRoutes;
