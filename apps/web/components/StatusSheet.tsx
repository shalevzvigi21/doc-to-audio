"use client";

import { useEffect, useState } from "react";
import { KeyRound, LogOut, Moon, Sun } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { GeminiQuota } from "@/components/GeminiQuota";
import { OpenAIUsage } from "@/components/OpenAIUsage";
import { openGeminiSetup } from "@/components/GeminiSetup";
import { openOpenAISetup } from "@/components/OpenAISetup";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoutButton } from "@/components/LogoutButton";
import { InstallRow } from "@/components/InstallHint";
import { mobileB1 } from "@/lib/mobile-strings-b1";
import { he } from "@/lib/strings";
import type { TtsQuotaResponse } from "@doc-to-audio/types";

export const OPEN_STATUS_SHEET = "open-status-sheet";

export function openStatusSheet(): void {
  window.dispatchEvent(new Event(OPEN_STATUS_SHEET));
}

export interface StatusSheetProps {
  open?: boolean;
  onClose?: () => void;
  quota?: TtsQuotaResponse | null;
}

/**
 * Mobile status & settings sheet.
 * Contains:
 * - GeminiQuota pill full-width + 52px setup button
 * - OpenAIUsage pill full-width + 52px setup button
 * - Theme toggle row
 * - Install app row
 * - LogoutButton row
 */
export function StatusSheet({
  open: controlledOpen,
  onClose: controlledOnClose,
  quota,
}: StatusSheetProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  useEffect(() => {
    const handleOpen = () => setInternalOpen(true);
    window.addEventListener(OPEN_STATUS_SHEET, handleOpen);
    return () => window.removeEventListener(OPEN_STATUS_SHEET, handleOpen);
  }, []);

  const handleClose = () => {
    if (controlledOnClose) {
      controlledOnClose();
    }
    if (!isControlled) {
      setInternalOpen(false);
    }
  };

  const handleOpenGeminiSetup = () => {
    handleClose();
    openGeminiSetup();
  };

  const handleOpenOpenAISetup = () => {
    handleClose();
    openOpenAISetup();
  };

  return (
    <Sheet open={isOpen} onClose={handleClose} title={mobileB1.status.title}>
      <div className="flex flex-col gap-3 py-2">
        {/* Gemini quota pill stacked full-width */}
        <div
          className="w-full [&>button]:h-12 [&>button]:w-full [&>button]:justify-between [&>button]:rounded-2xl [&>button]:px-4 [&>div]:h-12 [&>div]:w-full [&>div]:justify-between [&>div]:rounded-2xl [&>div]:px-4"
          onClickCapture={handleClose}
        >
          <GeminiQuota initial={quota ?? null} />
        </div>

        {/* Gemini setup 52px row button */}
        <button
          type="button"
          onClick={handleOpenGeminiSetup}
          className="flex h-[52px] w-full items-center gap-3.5 rounded-2xl border bg-card px-4 text-start font-medium text-foreground transition hover:bg-secondary active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <KeyRound className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">{mobileB1.status.geminiSetup}</span>
        </button>

        {/* OpenAI usage pill stacked full-width */}
        <div
          className="w-full [&>button]:h-12 [&>button]:w-full [&>button]:justify-between [&>button]:rounded-2xl [&>button]:px-4 [&>div]:h-12 [&>div]:w-full [&>div]:justify-between [&>div]:rounded-2xl [&>div]:px-4"
          onClickCapture={handleClose}
        >
          <OpenAIUsage />
        </div>

        {/* OpenAI setup 52px row button */}
        <button
          type="button"
          onClick={handleOpenOpenAISetup}
          className="flex h-[52px] w-full items-center gap-3.5 rounded-2xl border bg-card px-4 text-start font-medium text-foreground transition hover:bg-secondary active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <KeyRound className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">{mobileB1.status.openAISetup}</span>
        </button>

        {/* Theme row using ThemeToggle */}
        <div
          className="flex h-[52px] w-full cursor-pointer items-center justify-between rounded-2xl border bg-card px-4 transition hover:bg-secondary/50 active:scale-[0.99]"
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest("button")) {
              const btn = e.currentTarget.querySelector("button");
              btn?.click();
            }
          }}
        >
          <div className="flex items-center gap-3 font-medium text-foreground">
            <Sun className="h-5 w-5 text-muted-foreground dark:hidden" />
            <Moon className="hidden h-5 w-5 text-muted-foreground dark:block" />
            <span>{mobileB1.status.theme}</span>
          </div>
          <ThemeToggle />
        </div>

        {/* Install app row */}
        <InstallRow />

        {/* LogoutButton as the last row */}
        <div
          className="flex h-[52px] w-full cursor-pointer items-center justify-between rounded-2xl border border-destructive/20 bg-card px-4 text-destructive transition hover:bg-destructive/10 active:scale-[0.99]"
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest("button")) {
              const form = e.currentTarget.querySelector("form");
              form?.requestSubmit?.() || form?.submit();
            }
          }}
        >
          <div className="flex items-center gap-3 font-medium">
            <LogOut className="h-5 w-5 shrink-0" />
            <span>{he.library.signOut}</span>
          </div>
          <LogoutButton />
        </div>
      </div>
    </Sheet>
  );
}
