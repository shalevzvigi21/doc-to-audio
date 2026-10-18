"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { CheckCircle2, ExternalLink, KeyRound, X } from "lucide-react";
import type { TtsQuotaResponse } from "@doc-to-audio/types";
import { Button } from "@/components/ui/button";
import { removeGeminiKeyAction, saveGeminiKeyAction } from "@/lib/actions/gemini";
import type { ActionResult } from "@/lib/actions/types";
import { he } from "@/lib/strings";

/** Anything can open the guide by dispatching this event. */
export const OPEN_GEMINI_SETUP = "open-gemini-setup";
/** Fired after the key is saved or removed, so quota widgets refresh. */
export const GEMINI_KEY_CHANGED = "gemini-key-changed";
const SEEN_KEY = "gemini-setup-seen";

export function openGeminiSetup(): void {
  window.dispatchEvent(new Event(OPEN_GEMINI_SETUP));
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="sm:shrink-0">
      {pending ? he.gemini.saving : he.gemini.save}
    </Button>
  );
}

/**
 * Hebrew step-by-step guide to getting a Gemini API key, with the field to
 * paste it into. Opens by itself the first time a signed-in user reaches the
 * library without a key, and any time something dispatches OPEN_GEMINI_SETUP.
 * Mounted once, in the root layout.
 */
export function GeminiSetup() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState(false);
  const [status, setStatus] = useState<TtsQuotaResponse["geminiKey"] | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, startRemove] = useTransition();
  const [state, formAction] = useFormState<ActionResult, FormData>(saveGeminiKeyAction, {});
  const checkedFor = useRef<string | null>(null);

  const fetchStatus = async (): Promise<TtsQuotaResponse["geminiKey"] | null> => {
    try {
      const res = await fetch("/api/tts/quota", { cache: "no-store" });
      if (!res.ok) return null;
      const next = (await res.json()) as TtsQuotaResponse;
      setStatus(next.geminiKey ?? null);
      return next.geminiKey ?? null;
    } catch {
      return null;
    }
  };

  const close = () => {
    setOpen(false);
    setReplacing(false);
    setConfirmRemove(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  // Open on request, from the header pill or from a "missing key" error.
  useEffect(() => {
    const onOpen = () => {
      setFirst(false);
      setOpen(true);
      void fetchStatus();
    };
    window.addEventListener(OPEN_GEMINI_SETUP, onOpen);
    return () => window.removeEventListener(OPEN_GEMINI_SETUP, onOpen);
  }, []);

  // First launch: a signed-in user with no key lands on the library.
  useEffect(() => {
    if (!pathname.startsWith("/library") || checkedFor.current === "done") return;
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* ignore */
    }
    if (seen) {
      checkedFor.current = "done";
      return;
    }
    void fetchStatus().then((s) => {
      if (!s) return; // not signed in yet, or the API is down: try again next navigation
      checkedFor.current = "done";
      if (s.source === "none") {
        setFirst(true);
        setOpen(true);
      }
    });
  }, [pathname]);

  // Saved successfully.
  useEffect(() => {
    if (!state.success) return;
    window.dispatchEvent(new Event(GEMINI_KEY_CHANGED));
    router.refresh();
    void fetchStatus();
    setReplacing(false);
    setFirst(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  }, [state, router]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const hasOwnKey = status?.source === "user";
  const showForm = !hasOwnKey || replacing;
  const justSaved = state.success && hasOwnKey && !replacing;

  const remove = () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      setTimeout(() => setConfirmRemove(false), 4000);
      return;
    }
    startRemove(async () => {
      await removeGeminiKeyAction();
      window.dispatchEvent(new Event(GEMINI_KEY_CHANGED));
      router.refresh();
      await fetchStatus();
      setConfirmRemove(false);
    });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex animate-fade-in items-end justify-center bg-black/55 backdrop-blur-md sm:items-center"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gemini-setup-title"
        className="max-h-full w-full max-w-[560px] animate-sheet-up overflow-y-auto rounded-t-[32px] bg-background px-6 pb-[calc(24px+env(safe-area-inset-bottom,0px))] pt-5 sm:rounded-[32px]"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-soft text-primary">
            <KeyRound className="h-5 w-5" />
          </div>
          <button
            type="button"
            onClick={close}
            aria-label={he.gemini.close}
            className="-me-2 grid h-10 w-10 place-items-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <h2 id="gemini-setup-title" className="mt-3 text-balance text-2xl font-extrabold tracking-tight">
          {first ? he.gemini.welcomeTitle : he.gemini.title}
        </h2>

        {hasOwnKey && !replacing ? (
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border bg-card p-4">
              <CheckCircle2 className="h-6 w-6 shrink-0 text-ok" />
              <div className="min-w-0">
                <div className="font-semibold">{justSaved ? he.gemini.done : he.gemini.savedTitle}</div>
                <div className="num text-sm text-muted-foreground">••••{status?.last4}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setReplacing(true)}>
                {he.gemini.replace}
              </Button>
              <Button variant="ghost" disabled={removing} onClick={remove} className="text-destructive hover:text-destructive">
                {confirmRemove ? he.gemini.removeConfirm : he.gemini.remove}
              </Button>
              <Button onClick={close} className="ms-auto">
                {he.gemini.close}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-2 text-muted-foreground">{he.gemini.intro}</p>
            {status?.source === "server" && <p className="mt-2 text-sm text-warn">{he.gemini.serverKeyNote}</p>}

            <h3 className="mt-6 text-sm font-semibold">{he.gemini.stepsHeading}</h3>
            <ol className="mt-3 space-y-3">
              {he.gemini.steps.map((step, i) => (
                <li key={step.title} className="flex gap-3">
                  <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full bg-foreground text-[13px] text-background">
                    {i + 1}
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <div className="font-medium leading-snug">{step.title}</div>
                    <div className="text-sm text-muted-foreground">{step.body}</div>
                    {i === 0 && (
                      <a
                        href="https://aistudio.google.com/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex h-9 items-center gap-2 rounded-lg bg-secondary px-3.5 text-sm font-semibold hover:brightness-95 dark:hover:brightness-125"
                      >
                        <ExternalLink className="h-4 w-4" />
                        {he.gemini.openStudio}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ol>

            <form action={formAction} className="mt-5">
              <label htmlFor="gemini-key" className="text-[13px] text-muted-foreground">
                {he.gemini.keyLabel}
              </label>
              <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                <input
                  id="gemini-key"
                  name="apiKey"
                  type="password"
                  dir="ltr"
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                  required
                  placeholder={he.gemini.keyPlaceholder}
                  className="num h-12 w-full min-w-0 rounded-xl border border-input bg-card px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <SaveButton />
              </div>
              {state.error && (
                <p role="alert" className="mt-2 text-sm font-medium text-destructive">
                  {state.error}
                </p>
              )}
            </form>

            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{he.gemini.privacy}</p>
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" size="sm" onClick={replacing ? () => setReplacing(false) : close}>
                {replacing ? he.gemini.close : he.gemini.later}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
