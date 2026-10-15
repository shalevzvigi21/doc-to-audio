"use client";

import { useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

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
  const dragging = useRef(false);

  const seekFromPointer = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    onSeek(Math.max(0, Math.min(1, (clientX - r.left) / r.width)));
  };

  const played = Math.floor(progress * BARS);

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
      className="mt-6 flex h-28 cursor-pointer touch-none select-none items-center gap-[3px] rounded-lg"
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        seekFromPointer(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && seekFromPointer(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onKeyDown={(e) => {
        if (total <= 0) return;
        const step = 5 / total;
        if (e.key === "ArrowRight") onSeek(Math.min(1, progress + step));
        if (e.key === "ArrowLeft") onSeek(Math.max(0, progress - step));
      }}
    >
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
    </div>
  );
}
