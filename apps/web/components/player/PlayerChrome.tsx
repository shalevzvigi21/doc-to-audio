"use client";

import { useEffect } from "react";
import { ChevronUp, Pause, Play } from "lucide-react";
import { formatClock } from "@/lib/utils";
import { he } from "@/lib/strings";
import { usePlayer } from "@/components/player/context";
import { PlayerCard } from "@/components/player/PlayerCard";

/** Mini-player bar and the full-player sheet. Mounted once, by PlayerProvider. */
export function PlayerChrome() {
  const p = usePlayer();
  const { track, playing, current, total, sheetOpen, inlineActive } = p;

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key === "Escape") p.closeSheet();
      if (e.key === " " && el?.tagName !== "BUTTON") {
        e.preventDefault();
        p.toggle();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetOpen]);

  if (!track) return null;

  const pct = total > 0 ? (current / total) * 100 : 0;

  return (
    <>
      {!sheetOpen && !inlineActive && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[calc(14px+env(safe-area-inset-bottom,0px))]">
          <div
            role="button"
            tabIndex={0}
            aria-label={he.audio.open}
            onClick={p.openSheet}
            onKeyDown={(e) => {
              if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                p.openSheet();
              }
            }}
            className="pointer-events-auto relative flex w-full max-w-[640px] cursor-pointer items-center gap-3 overflow-hidden rounded-[22px] border bg-card/90 p-2.5 shadow-xl backdrop-blur-xl"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                p.toggle();
              }}
              aria-label={playing ? he.audio.pause : he.audio.play}
              className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
            >
              {playing ? <Pause className="h-[18px] w-[18px] fill-current" /> : <Play className="h-[18px] w-[18px] fill-current" />}
            </button>
            <div className="min-w-0 flex-1">
              <div dir="auto" className="truncate font-medium">
                {track.name}
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="num">
                  {formatClock(current)} / {formatClock(total)}
                </span>
              </div>
            </div>
            <ChevronUp className="me-1 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="absolute inset-x-0 bottom-0 h-[3px]">
              <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      )}

      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-black/55 backdrop-blur-md sm:items-center"
          onClick={(e) => e.target === e.currentTarget && p.closeSheet()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={track.name}
            className="max-h-full w-full max-w-[620px] animate-sheet-up overflow-y-auto rounded-t-[32px] bg-background px-6 pb-[calc(28px+env(safe-area-inset-bottom,0px))] pt-[18px] sm:rounded-[32px]"
          >
            <PlayerCard variant="sheet" />
          </div>
        </div>
      )}
    </>
  );
}
