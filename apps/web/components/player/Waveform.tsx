"use client";

import { useMemo, useRef, useState } from "react";
import { cn, formatClock } from "@/lib/utils";

const BARS = 64;

/** Deterministic bar heights from the track id, so a file always looks the same. */
function heights(id: string): number[] {
  let seed = 0;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
  const phase = seed % 7;
  const out: number[] = [];
  for (let k = 0; k < BARS; k++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const env = 0.45 + 0.55 * Math.abs(Math.sin((k / BARS) * 5.2 + phase));
    out.push(14 + Math.round((((seed >>> 8) % 100) / 100) * 64 * env + 22 * env));
  }
  return out;
}

/** Seekable waveform. Click or drag to jump, arrow keys to nudge. */
export function Waveform({
  id,
  progress,
  total,
  current,
  onSeek,
  label,
}: {
  id: string;
  progress: number;
  total: number;
  current: number;
  onSeek: (fraction: number) => void;
  label: string;
}) {
  const bars = useMemo(() => heights(id), [id]);
  const ref = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragFraction, setDragFraction] = useState<number | null>(null);

  const seekFromPointer = (clientX: number): number => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || r.width === 0) return 0;
    const fraction = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    onSeek(fraction);
    return fraction;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setIsDragging(true);
    const frac = seekFromPointer(e.clientX);
    setDragFraction(frac);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const frac = seekFromPointer(e.clientX);
    setDragFraction(frac);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setIsDragging(false);
    setDragFraction(null);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setIsDragging(false);
    setDragFraction(null);
  };

  const currentFraction = Math.max(
    0,
    Math.min(1, isDragging && dragFraction !== null ? dragFraction : progress),
  );
  const played = Math.floor(currentFraction * BARS);
  const activeTime = currentFraction * total;

  return (
    <div
      ref={ref}
      dir="ltr"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.floor(total)}
      aria-valuenow={Math.floor(current)}
      className="relative mt-6 flex h-[112px] cursor-pointer touch-none select-none items-center gap-[3px] rounded-lg"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={(e) => {
        if (total <= 0) return;
        const step = 5 / total;
        if (e.key === "ArrowRight") onSeek(Math.min(1, progress + step));
        if (e.key === "ArrowLeft") onSeek(Math.max(0, progress - step));
      }}
    >
      {/* Waveform bars */}
      {bars.map((h, i) => (
        <i
          key={i}
          style={{ height: h }}
          className={cn(
            "min-w-[2px] flex-1 rounded-[4px] transition-colors duration-100",
            i < played ? "bg-primary" : "bg-wave",
          )}
        />
      ))}

      {/* Visible circular scrub handle: 16px resting, 24px while dragging */}
      <div
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-background shadow-md transition-all duration-100",
          isDragging ? "h-6 w-6" : "h-4 w-4",
        )}
        style={{ left: `${currentFraction * 100}%` }}
        aria-hidden="true"
      />

      {/* Floating time label above finger while scrubbing */}
      {isDragging && (
        <div
          className="pointer-events-none absolute -top-10 -translate-x-1/2 rounded-full bg-foreground px-2.5 py-1 text-xs font-semibold text-background shadow-lg num whitespace-nowrap"
          style={{ left: `${currentFraction * 100}%` }}
          aria-hidden="true"
        >
          {formatClock(activeTime)}
        </div>
      )}
    </div>
  );
}
