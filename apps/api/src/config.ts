import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Load apps/api/.env into process.env using Node's built-in env-file loader.
// No-op if the file is absent (e.g. production, where the platform injects env
// vars directly). Resolved relative to this file so it works from any cwd.
const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env");
const loadEnvFile = (process as NodeJS.Process & { loadEnvFile?: (p?: string) => void })
  .loadEnvFile;
try {
  loadEnvFile?.(envFile);
} catch {
  /* .env not found — fall back to the real environment */
}

/**
 * Centralised, validated environment configuration.
 * Throws at startup if a required variable is missing or malformed.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required").default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  /**
   * Optional server-wide Gemini key(s). Users normally add their own key in the app;
   * these are only a fallback for users who have not.
   */
  GEMINI_API_KEY: z.string().optional().default(""),
  /** Secret used to encrypt users' saved Gemini keys. Falls back to a key derived from JWT_SECRET. */
  ENCRYPTION_KEY: z.string().optional().default(""),
  /** Comma-separated list of Gemini API keys to rotate through when one exhausts its daily quota. */
  GEMINI_API_KEYS: z.string().optional().default(""),
  /** Set to "true" once your Google project has billing enabled: lifts the 100/day display cap and speeds up requests. */
  GEMINI_PAID_TIER: z.string().optional().default(""),
  /** Gemini text model for multi-column OCR reconstruction. Override if the default slug is unavailable. */
  GEMINI_TEXT_MODEL: z.string().optional().default("gemini-3.1-pro"),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional().default(""),
  // Azure Speech (optional alternative TTS provider). Both key + region are
  // required to enable it; voice defaults to a Hebrew neural voice.
  AZURE_SPEECH_KEY: z.string().optional().default(""),
  AZURE_SPEECH_REGION: z.string().optional().default(""),
  AZURE_SPEECH_VOICE: z.string().optional().default("he-IL-AvriNeural"),
  // OpenAI text-to-speech (optional engine). Only the key is required.
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_TTS_MODEL: z.string().optional().default("gpt-4o-mini-tts"),
  OPENAI_TTS_VOICE: z.string().optional().default("onyx"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  UPLOAD_DIR: z.string().default("./uploads"),
  // Cloudflare R2 (S3-compatible). All four required to enable R2 storage;
  // when absent the app falls back to local disk (UPLOAD_DIR).
  R2_ACCOUNT_ID: z.string().optional().default(""),
  R2_ACCESS_KEY_ID: z.string().optional().default(""),
  R2_SECRET_ACCESS_KEY: z.string().optional().default(""),
  R2_BUCKET: z.string().optional().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("❌ Invalid environment configuration:");
  // eslint-disable-next-line no-console
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

// Build the ordered list of Gemini API keys. GEMINI_API_KEYS (comma-separated)
// takes precedence; falls back to single GEMINI_API_KEY for backwards compat.
const geminiApiKeys = (() => {
  const multi = env.GEMINI_API_KEYS
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (multi.length > 0) return multi;
  return env.GEMINI_API_KEY ? [env.GEMINI_API_KEY] : [];
})();

export const config = {
  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,
  jwtSecret: env.JWT_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN,
  encryptionKey: env.ENCRYPTION_KEY,
  geminiApiKey: geminiApiKeys[0] ?? "",
  geminiApiKeys,
  geminiTextModel: env.GEMINI_TEXT_MODEL,
  geminiPaidTier: /^(1|true|yes)$/i.test(env.GEMINI_PAID_TIER.trim()),
  googleCredentials: env.GOOGLE_APPLICATION_CREDENTIALS,
  azureSpeechKey: env.AZURE_SPEECH_KEY,
  azureSpeechRegion: env.AZURE_SPEECH_REGION,
  azureSpeechVoice: env.AZURE_SPEECH_VOICE,
  openaiApiKey: env.OPENAI_API_KEY.trim(),
  openaiTtsModel: env.OPENAI_TTS_MODEL.trim(),
  openaiTtsVoice: env.OPENAI_TTS_VOICE.trim(),
  /** True when an OpenAI key is set (so OpenAI can be offered). */
  openaiConfigured: Boolean(env.OPENAI_API_KEY.trim()),
  /** True only when Azure Speech is fully configured (key + region). */
  azureConfigured: Boolean(env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION),
  host: env.HOST,
  port: env.PORT,
  corsOrigins: env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean),
  uploadDir: env.UPLOAD_DIR,
  r2AccountId: env.R2_ACCOUNT_ID,
  r2AccessKeyId: env.R2_ACCESS_KEY_ID,
  r2SecretAccessKey: env.R2_SECRET_ACCESS_KEY,
  r2Bucket: env.R2_BUCKET,
  /** True when all four R2 credentials are present. */
  r2Configured: Boolean(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET),
} as const;

export const CONVERSION_QUEUE_NAME = "conversion";
