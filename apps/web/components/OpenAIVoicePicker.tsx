"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_OPENAI_CHOICE,
  OPENAI_MODELS,
  OPENAI_PAGE_CHARS,
  PRICES_AS_OF,
  RECOMMENDED_VOICES,
  formatCents,
  modelInfo,
  normalizeChoice,
  type OpenAIChoice,
} from "@/lib/openai-catalog";
import { he } from "@/lib/strings";

const STORAGE_KEY = "doc2audio.openai.choice";

/** The user's last model + voice, remembered in this browser only. */
export function useOpenAIChoice(): [OpenAIChoice, (next: OpenAIChoice) => void] {
  const [choice, setChoice] = useState<OpenAIChoice>(DEFAULT_OPENAI_CHOICE);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setChoice(normalizeChoice(JSON.parse(raw) as Partial<OpenAIChoice>));
    } catch {
      /* storage blocked or corrupt: keep the default */
    }
  }, []);

  const update = (next: OpenAIChoice) => {
    const clean = normalizeChoice(next);
    setChoice(clean);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch {
      /* not remembering is fine */
    }
  };

  return [choice, update];
}

const selectClass =
  "h-10 rounded-xl border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

/** Model + voice dropdowns with an approximate price per page. */
export function OpenAIVoicePicker({
  value,
  onChange,
  disabled,
}: {
  value: OpenAIChoice;
  onChange: (next: OpenAIChoice) => void;
  disabled?: boolean;
}) {
  const model = modelInfo(value.model);

  return (
    <div className="flex flex-col gap-2 text-xs text-muted-foreground">
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1.5">
          {he.openai.model}
          <select
            className={selectClass}
            value={value.model}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, model: e.target.value })}
          >
            {OPENAI_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id} · {he.openai.aboutPrefix}
                {formatCents(m.centsPerPage)} {he.openai.perPage}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          {he.openai.voice}
          <select
            className={selectClass}
            value={value.voice}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, voice: e.target.value })}
          >
            {model.voices.map((v) => (
              <option key={v} value={v}>
                {v}
                {RECOMMENDED_VOICES.includes(v) ? ` · ${he.openai.recommended}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="max-w-[420px] leading-relaxed">
        <b className="text-foreground">
          {he.openai.aboutPrefix}
          {formatCents(model.centsPerPage)} {he.openai.perPage}
        </b>{" "}
        · {model.blurb}. {he.openai.voiceSamePrice}
      </p>
      <p className="max-w-[420px] leading-relaxed">
        {he.openai.priceNote(OPENAI_PAGE_CHARS.toLocaleString("en-US"), PRICES_AS_OF)}
      </p>
    </div>
  );
}
