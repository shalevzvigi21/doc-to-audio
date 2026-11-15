"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronUp, Pause, Play } from "lucide-react";
import { formatClock } from "@/lib/utils";
import { he } from "@/lib/strings";
import { usePlayer } from "@/components/player/context";
import { PlayerCard } from "@/components/player/PlayerCard";

/** Mini-player bar and the full-player sheet. Mounted once, by PlayerProvider. */
export function PlayerChrome() {
  const p = usePlayer();
  const { track, playing, current, total, sheetOpen, inlineActive } = p;

  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ y: number; time: number } | null>(null);

  // Lock body scroll while full player sheet is open
  useEffect(() => {
    if (!sheetOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [sheetOpen]);

  // Keyboard accessibility: Escape closes sheet, Space toggles playback
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      // A Sheet on top of the player (e.g. the sleep timer) handles its own Escape/Space.
      if (document.querySelector("[data-sheet]")) return;
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

  // Swipe-down pointer gesture on top handle/header area
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, a, input, textarea, select")) {
      return;
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragStartRef.current = { y: e.clientY, time: Date.now() };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const deltaY = e.clientY - dragStartRef.current.y;
    setDragY(deltaY > 0 ? deltaY : 0);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const deltaY = e.clientY - dragStartRef.current.y;
    const elapsed = Date.now() - dragStartRef.current.time;
    const velocity = elapsed > 0 ? deltaY / elapsed : 0;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    dragStartRef.current = null;
    setIsDragging(false);

    // Threshold >= 80px or fast flick (>20px with velocity > 0.5px/ms)
    if (deltaY >= 80 || (deltaY > 20 && velocity > 0.5)) {
      p.closeSheet();
    }
    setDragY(0);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragStartRef.current = null;
    setIsDragging(false);
    setDragY(0);
  };

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
            className="pointer-events-auto relative flex h-16 w-full max-w-[640px] cursor-pointer items-center gap-3 overflow-hidden rounded-[22px] border bg-card/90 px-3.5 shadow-xl backdrop-blur-xl transition active:scale-[0.99]"
          >
            <div className="min-w-0 flex-1 ps-1">
              <div dir="auto" className="truncate text-sm font-medium leading-snug">
                {track.name}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                <span className="num">
                  {formatClock(current)} / {formatClock(total)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                p.toggle();
              }}
              aria-label={playing ? he.audio.pause : he.audio.play}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm transition active:scale-95"
            >
              {playing ? (
                <Pause className="h-5 w-5 fill-current" />
              ) : (
                <Play className="h-5 w-5 translate-x-0.5 fill-current" />
              )}
            </button>

            <ChevronUp className="h-5 w-5 shrink-0 text-muted-foreground me-0.5" />

            <div className="absolute inset-x-0 bottom-0 h-[3px] bg-secondary/50">
              <div
                className="h-full bg-primary transition-[width] duration-150"
                style={{ width: `${pct}%` }}
              />
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
            style={
              dragY > 0
                ? {
                    transform: `translateY(${dragY}px)`,
                    transition: isDragging
                      ? "none"
                      : "transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)",
                  }
                : undefined
            }
            className="flex max-h-[94dvh] w-full max-w-[620px] animate-sheet-up flex-col rounded-t-[32px] bg-background shadow-2xl focus:outline-none sm:max-h-[92dvh] sm:rounded-[32px]"
          >
            {/* Top drag handle area with touch-none so content can scroll */}
            <div
              className="flex shrink-0 cursor-grab touch-none select-none flex-col items-center px-6 pt-3 pb-2 active:cursor-grabbing"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
            >
              <div
                className="h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/30"
                aria-hidden="true"
              />
            </div>

            {/* Scrollable sheet content */}
            <div className="flex-1 overflow-y-auto px-6 pb-[calc(28px+env(safe-area-inset-bottom,0px))] pt-1">
              <PlayerCard variant="sheet" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
