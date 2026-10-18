import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config } from "../config.js";

/**
 * Encrypt/decrypt small secrets (users' Gemini API keys) with AES-256-GCM.
 *
 * The 32-byte key is derived from ENCRYPTION_KEY, or from JWT_SECRET when that
 * is not set, so a fresh deployment works with no extra configuration. If the
 * secret later changes, old ciphertexts stop decrypting and `decryptSecret`
 * returns null; users are then simply asked to enter their key again.
 */
const key = createHash("sha256")
  .update(`doc-to-audio:secrets:v1:${config.encryptionKey || config.jwtSecret}`)
  .digest();

const PREFIX = "v1";

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

/** Returns the plaintext, or null if the value is malformed or the secret changed. */
export function decryptSecret(payload: string): string | null {
  try {
    const [prefix, iv, tag, data] = payload.split(":");
    if (prefix !== PREFIX || !iv || !tag || !data) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
