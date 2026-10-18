import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { decryptSecret } from "../lib/crypto.js";

/**
 * Which Gemini key(s) a conversion should use, and the Redis "scope" under
 * which its daily usage and exhaustion are tracked.
 *
 * Users bring their own key (`source: "user"`). If a user has not added one,
 * the server's GEMINI_API_KEY(S) are used when configured (`source: "server"`),
 * so an existing single-key deployment keeps working.
 */
export interface GeminiKeyContext {
  keys: string[];
  scope: string;
  source: "user" | "server";
}

export class MissingGeminiKeyError extends Error {
  constructor() {
    super("No Gemini API key is saved for this account");
    this.name = "MissingGeminiKeyError";
  }
}

export const SERVER_SCOPE = "server";
export const userScope = (userId: string): string => `user:${userId}`;

export async function resolveGeminiContext(userId: string): Promise<GeminiKeyContext | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { geminiKeyEnc: true } });
  if (user?.geminiKeyEnc) {
    const key = decryptSecret(user.geminiKeyEnc);
    if (key) return { keys: [key], scope: userScope(userId), source: "user" };
  }
  if (config.geminiApiKeys.length > 0) {
    return { keys: [...config.geminiApiKeys], scope: SERVER_SCOPE, source: "server" };
  }
  return null;
}

/** Light check against Google that a pasted key is real. Does not consume TTS quota. */
export async function validateGeminiKey(
  apiKey: string,
): Promise<{ ok: true } | { ok: false; reason: "invalid" | "unreachable" }> {
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    // 400 "API key not valid" and 403 are what Google returns for bad keys.
    if (res.status === 400 || res.status === 401 || res.status === 403) return { ok: false, reason: "invalid" };
    return { ok: false, reason: "unreachable" };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}
