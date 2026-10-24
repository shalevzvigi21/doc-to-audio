"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Play, Sparkles, Square } from "lucide-react";
import { openOpenAISetup } from "@/components/OpenAISetup";
import {
  DEFAULT_OPENAI_CHOICE,
  OPENAI_MODELS,
  OPENAI_PAGE_CHARS,
  PRICES_AS_OF,
  RECOMMENDED_VOICES,
  TOP_PICKS,
  USD_TO_ILS,
  formatAgorot,
  formatShekels,
  modelInfo,
  normalizeChoice,
  shekelsPerPage,
  usdPerSample,
  type OpenAIChoice,
} from "@/lib/openai-catalog";
import { cn } from "@/lib/utils";
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

type SampleState = "idle" | "loading" | "playing" | "error";

/** Plays a short Hebrew sample of the chosen model + voice. Costs a fraction of an agora, and only the first time. */
function SampleButton({ choice, disabled }: { choice: OpenAIChoice; disabled?: boolean }) {
  const [state, setState] = useState<SampleState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setState("idle");
  };

  // Stop playback if the selection changes or the panel closes.
  useEffect(() => stop, [choice.model, choice.voice]);

  const play = async () => {
    if (state === "playing") return stop();
    setState("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/openai/sample", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(choice),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { code?: string };
        if (err.code === "OPENAI_KEY_MISSING") {
          openOpenAISetup();
          setMessage(he.openaiKey.missingShort);
        } else {
          setMessage(he.openai.sampleError);
        }
        setState("error");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setState("idle");
      };
      await audio.play();
      setState("playing");
    } catch {
      setMessage(he.openai.sampleError);
      setState("error");
    }
  };

  const cost = usdPerSample(modelInfo(choice.model)) * USD_TO_ILS;

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={play}
        disabled={disabled || state === "loading"}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-secondary px-4 text-sm font-medium text-foreground hover:bg-secondary/80 disabled:opacity-50"
      >
        {state === "loading" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : state === "playing" ? (
          <Square className="h-4 w-4 fill-current" />
        ) : (
          <Play className="h-4 w-4 fill-current" />
        )}
        {state === "playing" ? he.openai.sampleStop : he.openai.samplePlay}
      </button>
      <span className="max-w-[260px] leading-relaxed">{he.openai.sampleCost(formatAgorot(cost))}</span>
      {message && (
        <span role="alert" className="text-destructive">
          {message}
        </span>
      )}
    </div>
  );
}

/** Model + voice choice with approximate prices in shekels, recommended picks, and a sample button. */
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
    <div className="flex w-full flex-col gap-3 text-xs text-muted-foreground">
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 font-medium text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          {he.openai.topPicks}
        </div>
        <div className="flex flex-wrap gap-2">
          {TOP_PICKS.map((pick, i) => {
            const selected = value.model === pick.choice.model && value.voice === pick.choice.voice;
            const info = modelInfo(pick.choice.model);
            return (
              <button
                key={`${pick.choice.model}-${pick.choice.voice}`}
                type="button"
                disabled={disabled}
                title={pick.reason}
                aria-pressed={selected}
                onClick={() => onChange(pick.choice)}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-xl border bg-card px-3 py-2 text-start transition hover:border-foreground/30 disabled:opacity-50",
                  selected && "border-primary bg-soft",
                )}
              >
                <span className="font-semibold text-foreground">
                  <span className="num">{i + 1}.</span> <span dir="ltr">{pick.choice.voice}</span>
                </span>
                <span dir="ltr" className="num text-[11px]">
                  {pick.choice.model}
                </span>
                <span>
                  {he.openai.aboutPrefix}
                  {formatShekels(shekelsPerPage(info))} {he.openai.perPage}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 max-w-[460px] leading-relaxed">{he.openai.topPicksNote}</p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
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
                {formatShekels(shekelsPerPage(m))} {he.openai.perPage}
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

        <SampleButton choice={value} disabled={disabled} />
      </div>

      <p className="max-w-[460px] leading-relaxed">
        <b className="text-foreground">
          {he.openai.aboutPrefix}
          {formatShekels(shekelsPerPage(model))} {he.openai.perPage}
        </b>{" "}
        · {model.blurb}. {he.openai.voiceSamePrice}
      </p>
      <p className="max-w-[460px] leading-relaxed">
        {he.openai.priceNote(OPENAI_PAGE_CHARS.toLocaleString("en-US"), PRICES_AS_OF, USD_TO_ILS.toFixed(2))}
      </p>
    </div>
  );
}
