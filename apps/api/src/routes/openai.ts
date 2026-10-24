import type { FastifyPluginAsync } from "fastify";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { config } from "../config.js";
import { connection } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";
import { encryptSecret } from "../lib/crypto.js";
import { requireUser, badRequest } from "../lib/http.js";
import { resolveOpenAIKey, validateOpenAIKey } from "../services/openai-keys.service.js";
import { resolveOpenAIChoice, OpenAIChoiceError } from "../services/openai-catalog.js";
import { synthesizeOpenAI } from "../services/openai-tts.service.js";
import { monthlySpend, recordUsage } from "../services/openai-usage.service.js";

/**
 * Pasted keys often arrive wrapped in junk: an "OPENAI_API_KEY=" prefix from an
 * .env file, quotes, or stray spaces and line breaks. Strip those first.
 */
function cleanPastedKey(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value
    .replace(/^\s*(export\s+)?[A-Za-z_]*API_?KEY[A-Za-z_]*\s*=/i, "")
    .replace(/["'`\s‎‏‪-‮]/g, "");
}

// OpenAI keys look like "sk-…" or "sk-proj-…". Be tolerant about length and extra dashes.
const keySchema = z.object({
  apiKey: z
    .preprocess(cleanPastedKey, z.string())
    .pipe(z.string().regex(/^sk-[A-Za-z0-9_-]{16,300}$/, "The key looks wrong. It should start with sk-")),
});

const SAMPLE_TEXT = "שלום, כך נשמע הקול הזה בעברית. אפשר להאזין לדוגמה ולבחור.";
const SAMPLES_PER_HOUR = 30;

const openaiRoutes: FastifyPluginAsync = async (fastify) => {
  const statusFor = async (userId: string) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { openaiKeyEnc: true, openaiKeyLast4: true },
    });
    if (user?.openaiKeyEnc) return { source: "user" as const, last4: user.openaiKeyLast4 ?? null };
    if (config.openaiConfigured) return { source: "server" as const, last4: null };
    return { source: "none" as const, last4: null };
  };

  /** GET /me/openai-key — whether a key is saved (never returns the key itself). */
  fastify.get("/me/openai-key", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    return reply.send(await statusFor(user.id));
  });

  /** PUT /me/openai-key — verify the key with OpenAI, then store it encrypted. */
  fastify.put("/me/openai-key", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const parsed = keySchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { apiKey } = parsed.data;

    const check = await validateOpenAIKey(apiKey);
    if (!check.ok) {
      if (check.reason === "invalid") {
        return reply.code(400).send({
          statusCode: 400,
          error: "Bad Request",
          code: "OPENAI_KEY_INVALID",
          message: "OpenAI rejected this key",
        });
      }
      return reply.code(502).send({
        statusCode: 502,
        error: "Bad Gateway",
        code: "OPENAI_UNREACHABLE",
        message: "Could not reach OpenAI to verify the key",
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { openaiKeyEnc: encryptSecret(apiKey), openaiKeyLast4: apiKey.slice(-4) },
    });
    return reply.send(await statusFor(user.id));
  });

  /** DELETE /me/openai-key — remove the saved key. */
  fastify.delete("/me/openai-key", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    await prisma.user.update({ where: { id: user.id }, data: { openaiKeyEnc: null, openaiKeyLast4: null } });
    return reply.send(await statusFor(user.id));
  });

  /**
   * GET /me/usage — estimated OpenAI spend this month (US dollars) and which key
   * conversions will use. The web app converts to shekels for display.
   */
  fastify.get("/me/usage", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const [spend, key] = await Promise.all([monthlySpend(user.id), statusFor(user.id)]);
    return reply.send({ ...spend, openaiKey: key });
  });

  /**
   * POST /tts/sample — a short Hebrew sample in the chosen model and voice, so
   * the user can listen before converting. A sample costs a fraction of a cent,
   * so each (model, voice) is generated once and then served from disk for free.
   */
  fastify.post("/tts/sample", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;

    const body = z.object({ model: z.string().max(40).optional(), voice: z.string().max(40).optional() }).safeParse(request.body);
    if (!body.success) return badRequest(reply, "Invalid input");
    let choice;
    try {
      choice = resolveOpenAIChoice(body.data.model, body.data.voice);
    } catch (err) {
      if (err instanceof OpenAIChoiceError) return badRequest(reply, err.message);
      throw err;
    }

    const dir = path.join(config.uploadDir, "samples");
    const file = path.join(dir, `${choice.model}__${choice.voice}.mp3`);
    const cached = await readFile(file).catch(() => null);
    if (cached) {
      return reply.header("Content-Type", "audio/mpeg").header("X-Sample-Cached", "1").send(cached);
    }

    const key = await resolveOpenAIKey(user.id);
    if (!key) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        code: "OPENAI_KEY_MISSING",
        message: "Add an OpenAI key first",
      });
    }

    // Cap how many paid samples one account can generate per hour.
    try {
      const rateKey = `sample-rate:${user.id}:${new Date().toISOString().slice(0, 13)}`;
      const n = await connection.incr(rateKey);
      if (n === 1) await connection.expire(rateKey, 3700);
      if (n > SAMPLES_PER_HOUR) {
        return reply.code(429).send({ statusCode: 429, error: "Too Many Requests", message: "Too many samples this hour" });
      }
    } catch {
      /* limiter is best-effort */
    }

    await mkdir(dir, { recursive: true });
    const tmp = path.join(dir, `${choice.model}__${choice.voice}.${Date.now()}.tmp.mp3`);
    const seconds = await synthesizeOpenAI(SAMPLE_TEXT, tmp, undefined, choice, key.key);
    const audio = await readFile(tmp);
    await writeFile(file, audio);
    await rm(tmp, { force: true });
    await recordUsage({
      userId: user.id,
      kind: "sample",
      model: choice.model,
      voice: choice.voice,
      chars: SAMPLE_TEXT.length,
      seconds,
    });
    return reply.header("Content-Type", "audio/mpeg").send(audio);
  });
};

export default openaiRoutes;
