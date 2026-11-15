"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { CheckCircle2, Clipboard, ExternalLink, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { removeOpenAIKeyAction, saveOpenAIKeyAction } from "@/lib/actions/openai";
import type { ActionResult } from "@/lib/actions/types";
import { he } from "@/lib/strings";
import { mobileB2 } from "@/lib/mobile-strings-b2";

/** Anything can open the guide by dispatching this event. */
export const OPEN_OPENAI_SETUP = "open-openai-setup";
/** Fired after the key is saved or removed, so the spend pill refreshes. */
export const OPENAI_KEY_CHANGED = "openai-key-changed";
const SEEN_KEY = "openai-setup-seen";

export interface OpenAIKeyStatus {
  source: "user" | "server" | "none";
  last4: string | null;
}

export function openOpenAISetup(): void {
  window.dispatchEvent(new Event(OPEN_OPENAI_SETUP));
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="sm:shrink-0 max-sm:h-12 max-sm:w-full"
    >
      {pending ? he.openaiKey.saving : he.openaiKey.save}
    </Button>
  );
}

/**
 * Hebrew step-by-step guide to getting an OpenAI API key, with the field to
 * paste it into. Opens by itself the first time a signed-in user reaches the
 * library without any key, and any time something dispatches OPEN_OPENAI_SETUP.
 * Mounted once, in the root layout.
 */
export function OpenAISetup() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState(false);
  const [status, setStatus] = useState<OpenAIKeyStatus | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, startRemove] = useTransition();
  const [state, formAction] = useFormState<ActionResult, FormData>(saveOpenAIKeyAction, {});
  const [keyValue, setKeyValue] = useState("");
  const checkedFor = useRef<string | null>(null);

  const fetchStatus = async (): Promise<OpenAIKeyStatus | null> => {
    try {
      const res = await fetch("/api/openai/usage", { cache: "no-store" });
      if (!res.ok) return null;
      const next = (await res.json()) as { openaiKey?: OpenAIKeyStatus };
      setStatus(next.openaiKey ?? null);
      return next.openaiKey ?? null;
    } catch {
      return null;
    }
  };

  const close = () => {
    setOpen(false);
    setReplacing(false);
    setConfirmRemove(false);
    setKeyValue("");
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const handlePaste = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setKeyValue(text.trim());
        }
      }
    } catch {
      // try/catch; when it fails do nothing
    }
  };

  // Open on request, from the header pill or from a "missing key" error.
  useEffect(() => {
    const onOpen = () => {
      setFirst(false);
      setOpen(true);
      void fetchStatus();
    };
    window.addEventListener(OPEN_OPENAI_SETUP, onOpen);
    return () => window.removeEventListener(OPEN_OPENAI_SETUP, onOpen);
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
    window.dispatchEvent(new Event(OPENAI_KEY_CHANGED));
    router.refresh();
    void fetchStatus();
    setReplacing(false);
    setFirst(false);
    setKeyValue("");
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  }, [state, router]);

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
      await removeOpenAIKeyAction();
      window.dispatchEvent(new Event(OPENAI_KEY_CHANGED));
      router.refresh();
      await fetchStatus();
      setConfirmRemove(false);
    });
  };

  return (
    <Sheet
      fullScreenOnPhone
      open={open}
      onClose={close}
      title={first ? he.openaiKey.welcomeTitle : he.openaiKey.title}
      className="max-w-[560px]"
    >
      <div className="pt-2">
        <div className="mb-3 grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-soft text-primary">
          <KeyRound className="h-5 w-5" />
        </div>

        {!showForm ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border bg-card p-4">
              <CheckCircle2 className="h-6 w-6 shrink-0 text-ok" />
              <div className="min-w-0">
                <div className="font-semibold">{justSaved ? he.openaiKey.done : he.openaiKey.savedTitle}</div>
                <div className="num text-sm text-muted-foreground">••••{status?.last4}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setReplacing(true);
                  setKeyValue("");
                }}
              >
                {he.openaiKey.replace}
              </Button>
              <Button
                variant="ghost"
                disabled={removing}
                onClick={remove}
                className="text-destructive hover:text-destructive"
              >
                {confirmRemove ? he.openaiKey.removeConfirm : he.openaiKey.remove}
              </Button>
              <Button onClick={close} className="ms-auto">
                {he.openaiKey.close}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-muted-foreground">{he.openaiKey.intro}</p>
            {status?.source === "server" && (
              <p className="mt-2 text-sm text-warn">{he.openaiKey.serverKeyNote}</p>
            )}

            <h3 className="mt-6 text-sm font-semibold">{he.openaiKey.stepsHeading}</h3>
            <ol className="mt-3 space-y-3">
              {he.openaiKey.steps.map((step, i) => (
                <li key={step.title} className="flex gap-3">
                  <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full bg-foreground text-[13px] text-background">
                    {i + 1}
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <div className="font-medium leading-snug">{step.title}</div>
                    <div className="text-sm text-muted-foreground">{step.body}</div>
                    {i === 0 && (
                      <>
                        <a
                          href="https://platform.openai.com/api-keys"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex h-9 min-h-[44px] items-center gap-2 rounded-lg bg-secondary px-3.5 text-sm font-semibold hover:brightness-95 dark:hover:brightness-125"
                        >
                          <ExternalLink className="h-4 w-4" />
                          {he.openaiKey.openPlatform}
                        </a>
                        <div dir="ltr" className="num mt-1.5 select-all text-xs text-muted-foreground">
                          platform.openai.com/api-keys
                        </div>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ol>

            <form action={formAction} className="mt-5">
              <label htmlFor="openai-key" className="text-[13px] text-muted-foreground">
                {he.openaiKey.keyLabel}
              </label>
              <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                <div className="flex flex-1 gap-2">
                  <input
                    id="openai-key"
                    name="apiKey"
                    type="password"
                    dir="ltr"
                    autoComplete="off"
                    spellCheck={false}
                    autoFocus
                    required
                    value={keyValue}
                    onChange={(e) => setKeyValue(e.target.value)}
                    placeholder={he.openaiKey.keyPlaceholder}
                    className="num h-12 w-full min-w-0 rounded-xl border border-input bg-card px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handlePaste}
                    aria-label={mobileB2.setup.pasteAria}
                    className="h-12 min-h-[44px] min-w-[44px] shrink-0 gap-1.5 px-3 text-sm font-semibold"
                  >
                    <Clipboard className="h-4 w-4" />
                    <span>{mobileB2.setup.paste}</span>
                  </Button>
                </div>
                <SaveButton />
              </div>
              {state.error && (
                <p role="alert" className="mt-2 text-sm font-medium text-destructive">
                  {state.error}
                </p>
              )}
            </form>

            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{he.openaiKey.privacy}</p>
            <div className="mt-4 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={replacing ? () => setReplacing(false) : close}
              >
                {replacing ? he.openaiKey.close : he.openaiKey.later}
              </Button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
