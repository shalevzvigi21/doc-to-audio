import type { FastifyPluginAsync } from "fastify";
import type { TtsQuotaResponse } from "@doc-to-audio/types";
import { config } from "../config.js";
import { getGeminiUsage } from "../services/tts-usage.service.js";
import { requireUser } from "../lib/http.js";

const ttsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /tts/quota — today's Gemini free-tier usage so the UI can show how many
   * pages are left and whether to switch to Azure. The quota is global to the
   * server's Gemini key (shared across users), but the route still requires a
   * signed-in user.
   */
  fastify.get("/tts/quota", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;

    const gemini = await getGeminiUsage();
    const body: TtsQuotaResponse = {
      gemini,
      azureAvailable: config.azureConfigured,
    };
    return reply.send(body);
  });
};

export default ttsRoutes;
