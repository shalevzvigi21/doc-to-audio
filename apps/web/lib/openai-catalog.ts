/**
 * OpenAI text-to-speech models and voices the user can choose from, with an
 * approximate price per page. The ids must match the API's allowlist
 * (apps/api/src/services/openai-catalog.ts).
 *
 * Prices are ESTIMATES, in US cents, for one reference page. OpenAI's published
 * rates (checked October 2026):
 *   tts-1            $15 per 1M characters
 *   tts-1-hd         $30 per 1M characters
 *   gpt-4o-mini-tts  billed on audio length; OpenAI's own estimate is ~$0.015/minute
 * The voice does not change the price, only the model does.
 *
 * Reference page: 1,750 characters, measured on a real 11-page Hebrew PDF
 * (19,169 characters). With this app's calm-narrator setting, gpt-4o-mini-tts read
 * that PDF at about 193 seconds per page (3.2 minutes).
 */
export const PRICES_AS_OF = "אוקטובר 2026";
export const OPENAI_PAGE_CHARS = 1750;

const CLASSIC_VOICES = ["alloy", "ash", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"] as const;
const ALL_VOICES = [...CLASSIC_VOICES, "ballad", "verse", "marin", "cedar"] as const;

/** Voices OpenAI's guide recommends for best quality. */
export const RECOMMENDED_VOICES: readonly string[] = ["marin", "cedar"];

export interface OpenAIModelInfo {
  id: string;
  /** Short Hebrew description shown next to the model name. */
  blurb: string;
  /** Approximate cost of one reference page, in US cents. */
  centsPerPage: number;
  voices: readonly string[];
}

export const OPENAI_MODELS: readonly OpenAIModelInfo[] = [
  {
    id: "gpt-4o-mini-tts",
    blurb: "הדגם החדש, קורא בקצב רגוע של קריין",
    // 1,750 chars ≈ 3.2 minutes of audio × $0.015/min ≈ 4.8¢
    centsPerPage: 4.8,
    voices: ALL_VOICES,
  },
  {
    id: "tts-1",
    blurb: "מהיר וזול",
    // 1,750 chars × $15 / 1M = 2.6¢
    centsPerPage: 2.6,
    voices: CLASSIC_VOICES,
  },
  {
    id: "tts-1-hd",
    blurb: "איכות גבוהה יותר",
    // 1,750 chars × $30 / 1M = 5.3¢
    centsPerPage: 5.3,
    voices: CLASSIC_VOICES,
  },
];

export interface OpenAIChoice {
  model: string;
  voice: string;
}

export const DEFAULT_OPENAI_CHOICE: OpenAIChoice = { model: "gpt-4o-mini-tts", voice: "onyx" };

export function modelInfo(id: string): OpenAIModelInfo {
  return OPENAI_MODELS.find((m) => m.id === id) ?? OPENAI_MODELS[0];
}

/** Keep a stored or edited choice valid: unknown model → default, unsupported voice → first voice. */
export function normalizeChoice(choice: Partial<OpenAIChoice> | null | undefined): OpenAIChoice {
  const model = modelInfo(choice?.model ?? DEFAULT_OPENAI_CHOICE.model);
  const voice = choice?.voice && model.voices.includes(choice.voice) ? choice.voice : model.voices[0];
  return { model: model.id, voice: voice === undefined ? DEFAULT_OPENAI_CHOICE.voice : voice };
}

/** "4.8" → shown as "כ-4.8¢". */
export function formatCents(cents: number): string {
  return `${cents.toFixed(1)}¢`;
}
