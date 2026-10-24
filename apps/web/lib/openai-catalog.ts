/**
 * OpenAI text-to-speech models and voices the user can choose from, with an
 * approximate price per page in shekels. The ids must match the API's allowlist
 * (apps/api/src/services/openai-catalog.ts).
 *
 * Every price here is an ESTIMATE. OpenAI's published rates (checked October 2026):
 *   tts-1            $15 per 1M characters
 *   tts-1-hd         $30 per 1M characters
 *   gpt-4o-mini-tts  billed on audio length; OpenAI's own estimate is ~$0.015/minute
 * The voice does not change the price, only the model does.
 *
 * Reference page: 1,750 characters, measured on a real 11-page Hebrew PDF
 * (19,169 characters). With this app's calm-narrator setting, gpt-4o-mini-tts read
 * that PDF at about 193 seconds per page (3.2 minutes).
 *
 * Dollars are shown as shekels at USD_TO_ILS. That rate is a rough mid-market figure
 * (about 3.06 in the most recent quotes found, July 2026) — update it when it drifts.
 */
export const PRICES_AS_OF = "אוקטובר 2026";
export const OPENAI_PAGE_CHARS = 1750;
export const USD_TO_ILS = 3.06;

/** Characters spoken in the voice sample, and the chars/second used to price a model billed by audio length. */
export const SAMPLE_CHARS = 57;
const SPOKEN_CHARS_PER_SECOND = 9;

const CLASSIC_VOICES = ["alloy", "ash", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"] as const;
const ALL_VOICES = [...CLASSIC_VOICES, "ballad", "verse", "marin", "cedar"] as const;

export interface OpenAIModelInfo {
  id: string;
  /** Short Hebrew description shown next to the model name. */
  blurb: string;
  /** Price per million characters in USD, for models billed by text. */
  usdPerMillionChars?: number;
  /** Price per minute of audio in USD, for models billed by audio length. */
  usdPerMinute?: number;
  voices: readonly string[];
}

export const OPENAI_MODELS: readonly OpenAIModelInfo[] = [
  {
    id: "gpt-4o-mini-tts",
    blurb: "הדגם החדש ביותר של OpenAI, קורא בקצב רגוע של קריין",
    usdPerMinute: 0.015,
    voices: ALL_VOICES,
  },
  { id: "tts-1", blurb: "מהיר וזול", usdPerMillionChars: 15, voices: CLASSIC_VOICES },
  { id: "tts-1-hd", blurb: "איכות גבוהה יותר", usdPerMillionChars: 30, voices: CLASSIC_VOICES },
];

/** Voices OpenAI's guide recommends for best quality. */
export const RECOMMENDED_VOICES: readonly string[] = ["marin", "cedar"];

export interface OpenAIChoice {
  model: string;
  voice: string;
}

export const DEFAULT_OPENAI_CHOICE: OpenAIChoice = { model: "gpt-4o-mini-tts", voice: "marin" };

export interface TopPick {
  choice: OpenAIChoice;
  /** Why it is on the list. Honest about how much evidence there is. */
  reason: string;
}

/**
 * Starting points for Hebrew. There is no published head-to-head Hebrew test of
 * OpenAI voices, so this is a judgment call: OpenAI itself recommends marin and
 * cedar for best quality, and its guide lists Hebrew as supported. tts-1-hd + onyx
 * is the cheaper, older alternative. Listen to the samples to decide.
 */
export const TOP_PICKS: readonly TopPick[] = [
  { choice: { model: "gpt-4o-mini-tts", voice: "marin" }, reason: "OpenAI ממליצה עליו לאיכות הטובה ביותר" },
  { choice: { model: "gpt-4o-mini-tts", voice: "cedar" }, reason: "גם הוא בהמלצת OpenAI לאיכות" },
  { choice: { model: "tts-1-hd", voice: "onyx" }, reason: "חלופה ותיקה בקול עמוק, ללא הנחיות סגנון" },
];

export function modelInfo(id: string): OpenAIModelInfo {
  return OPENAI_MODELS.find((m) => m.id === id) ?? OPENAI_MODELS[0];
}

/** Keep a stored or edited choice valid: unknown model → default, unsupported voice → first voice. */
export function normalizeChoice(choice: Partial<OpenAIChoice> | null | undefined): OpenAIChoice {
  const model = modelInfo(choice?.model ?? DEFAULT_OPENAI_CHOICE.model);
  const voice = choice?.voice && model.voices.includes(choice.voice) ? choice.voice : model.voices[0];
  return { model: model.id, voice: voice ?? DEFAULT_OPENAI_CHOICE.voice };
}

function usdFor(model: OpenAIModelInfo, chars: number): number {
  if (model.usdPerMillionChars !== undefined) return (chars * model.usdPerMillionChars) / 1_000_000;
  const seconds = chars / SPOKEN_CHARS_PER_SECOND;
  return (seconds / 60) * (model.usdPerMinute ?? 0);
}

/** gpt-4o-mini-tts is priced per minute: this page takes ~3.2 minutes at the app's calm pace. */
const MINI_TTS_SECONDS_PER_PAGE = 193;

export function usdPerPage(model: OpenAIModelInfo): number {
  if (model.usdPerMinute !== undefined) return (MINI_TTS_SECONDS_PER_PAGE / 60) * model.usdPerMinute;
  return usdFor(model, OPENAI_PAGE_CHARS);
}

export function usdPerSample(model: OpenAIModelInfo): number {
  return usdFor(model, SAMPLE_CHARS);
}

export function shekelsPerPage(model: OpenAIModelInfo): number {
  return usdPerPage(model) * USD_TO_ILS;
}

/** "₪0.15" for a page, in whole shekels. */
export function formatShekels(shekels: number): string {
  return `₪${shekels.toFixed(shekels < 1 ? 2 : 1)}`;
}

/** A tiny amount, shown in agorot: "כ-0.5 אגורות". */
export function formatAgorot(shekels: number): string {
  const agorot = shekels * 100;
  return `כ-${agorot < 10 ? agorot.toFixed(1) : Math.round(agorot)} אגורות`;
}

export function usdToShekels(usd: number): number {
  return usd * USD_TO_ILS;
}
