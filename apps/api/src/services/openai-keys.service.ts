import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { decryptSecret } from "../lib/crypto.js";

/**
 * Which OpenAI key a conversion uses. Users bring their own key (`source:
 * "user"`). If a user has not added one, the server's OPENAI_API_KEY is used
 * when configured (`source: "server"`), so a single-owner install keeps working.
 */
export interface OpenAIKeyContext {
  key: string;
  source: "user" | "server";
}

export class MissingOpenAIKeyError extends Error {
  constructor() {
    super("No OpenAI API key is saved for this account");
    this.name = "MissingOpenAIKeyError";
  }
}

export async function resolveOpenAIKey(userId: string): Promise<OpenAIKeyContext | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { openaiKeyEnc: true } });
  if (user?.openaiKeyEnc) {
    const key = decryptSecret(user.openaiKeyEnc);
    if (key) return { key, source: "user" };
  }
  if (config.openaiConfigured) return { key: config.openaiApiKey, source: "server" };
  return null;
}

/**
 * Light check against OpenAI that a pasted key is real. Listing models costs
 * nothing. 401 means the key is wrong. 403 means the key is real but restricted
 * (for example it has no permission to list models) — it may still be able to
 * make speech, so it is accepted.
 */
export async function validateOpenAIKey(
  apiKey: string,
): Promise<{ ok: true } | { ok: false; reason: "invalid" | "unreachable" }> {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok || res.status === 403) return { ok: true };
    if (res.status === 401) return { ok: false, reason: "invalid" };
    return { ok: false, reason: "unreachable" };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}
