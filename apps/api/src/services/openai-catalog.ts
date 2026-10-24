import { config } from "../config.js";

/**
 * The OpenAI TTS models and voices a user may pick. This is also the allowlist
 * the API validates against, so a request can never send an arbitrary model or
 * voice name to OpenAI (and never a model that would bill unexpectedly).
 *
 * Voice lists follow OpenAI's text-to-speech guide: all 13 voices work with
 * gpt-4o-mini-tts; tts-1 and tts-1-hd support a smaller set of nine.
 */
const CLASSIC_VOICES = ["alloy", "ash", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"] as const;
const ALL_VOICES = [...CLASSIC_VOICES, "ballad", "verse", "marin", "cedar"] as const;

export const OPENAI_MODEL_VOICES: Record<string, readonly string[]> = {
  "gpt-4o-mini-tts": ALL_VOICES,
  "tts-1": CLASSIC_VOICES,
  "tts-1-hd": CLASSIC_VOICES,
};

export interface OpenAIChoice {
  model: string;
  voice: string;
}

export class OpenAIChoiceError extends Error {}

/**
 * Turn an optional (model, voice) request into a valid pair. Missing values fall
 * back to the server defaults; an unknown model, or a voice the model does not
 * support, throws OpenAIChoiceError with a message safe to show the user.
 */
export function resolveOpenAIChoice(model?: string, voice?: string): OpenAIChoice {
  const chosenModel = model || config.openaiTtsModel;
  const voices = OPENAI_MODEL_VOICES[chosenModel];
  if (!voices) throw new OpenAIChoiceError(`Unknown OpenAI model "${chosenModel}"`);

  const chosenVoice = voice || (voices.includes(config.openaiTtsVoice) ? config.openaiTtsVoice : voices[0]);
  if (!voices.includes(chosenVoice)) {
    throw new OpenAIChoiceError(`The voice "${chosenVoice}" is not available for ${chosenModel}`);
  }
  return { model: chosenModel, voice: chosenVoice };
}
