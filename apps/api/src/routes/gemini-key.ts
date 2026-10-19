import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { GeminiKeyStatus } from "@doc-to-audio/types";
import { prisma } from "../lib/prisma.js";
import { encryptSecret } from "../lib/crypto.js";
import { config } from "../config.js";
import { requireUser, badRequest } from "../lib/http.js";
import { validateGeminiKey, userScope } from "../services/gemini-keys.service.js";
import { resetGeminiScope } from "../services/tts-usage.service.js";

/**
 * Pasted keys often arrive wrapped in junk: a "GEMINI_API_KEY=" prefix from an
 * .env file, quotes, or stray spaces/line breaks. Strip those before checking.
 */
function cleanPastedKey(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value
    .replace(/^\s*(export\s+)?[A-Za-z_]*API_?KEY[A-Za-z_]*\s*=/i, "")
    .replace(/["'`\s\u200e\u200f\u202a-\u202e]/g, "");
}

// Google AI Studio keys look like "AIza…" (39 chars) or the newer "AQ.…" form (contains a dot); allow some slack for format changes.
const keySchema = z.object({
  apiKey: z
    .preprocess(cleanPastedKey, z.string())
    .pipe(z.string())
    .pipe(z.string().regex(/^[A-Za-z0-9_.-]{20,128}$/, "The key looks wrong. Copy it again from Google AI Studio.")),
});

async function statusFor(userId: string): Promise<GeminiKeyStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { geminiKeyEnc: true, geminiKeyLast4: true },
  });
  if (user?.geminiKeyEnc) return { source: "user", last4: user.geminiKeyLast4 ?? null };
  if (config.geminiApiKeys.length > 0) return { source: "server", last4: null };
  return { source: "none", last4: null };
}

const geminiKeyRoutes: FastifyPluginAsync = async (fastify) => {
  /** GET /me/gemini-key — whether a key is saved (never returns the key itself). */
  fastify.get("/me/gemini-key", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    return reply.send(await statusFor(user.id));
  });

  /** PUT /me/gemini-key — verify the key with Google, then store it encrypted. */
  fastify.put("/me/gemini-key", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const parsed = keySchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { apiKey } = parsed.data;

    const check = await validateGeminiKey(apiKey);
    if (!check.ok) {
      if (check.reason === "invalid") {
        return reply.code(400).send({
          statusCode: 400,
          error: "Bad Request",
          code: "GEMINI_KEY_INVALID",
          message: "Google rejected this key",
        });
      }
      return reply.code(502).send({
        statusCode: 502,
        error: "Bad Gateway",
        code: "GEMINI_UNREACHABLE",
        message: "Could not reach Google to verify the key",
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { geminiKeyEnc: encryptSecret(apiKey), geminiKeyLast4: apiKey.slice(-4) },
    });
    await resetGeminiScope(userScope(user.id));
    return reply.send(await statusFor(user.id));
  });

  /** DELETE /me/gemini-key — remove the saved key. */
  fastify.delete("/me/gemini-key", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    await prisma.user.update({
      where: { id: user.id },
      data: { geminiKeyEnc: null, geminiKeyLast4: null },
    });
    await resetGeminiScope(userScope(user.id));
    return reply.send(await statusFor(user.id));
  });
};

export default geminiKeyRoutes;
