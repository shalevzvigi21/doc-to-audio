"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Download, Link2, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { cn, formatClock } from "@/lib/utils";
import { he } from "@/lib/strings";
import { usePlayer } from "@/components/player/context";
import { Waveform } from "@/components/player/Waveform";

/**
 * The full player. Shown as a bottom sheet from the mini-player
 * (`variant="sheet"`), or in the page itself (`variant="inline"`).
 */
export function PlayerCard({
  variant,
  showTitle = true,
  shareUrl,
}: {
  variant: "sheet" | "inline";
  showTitle?: boolean;
  shareUrl?: string;
}) {
  const p = usePlayer();
  const { track, playing, current, total, speed } = p;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (variant !== "inline") return;
    return p.registerInline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  if (!track) return null;

  const progress = total > 0 ? current / total : 0;

  const copyLink = async () => {
    const url = shareUrl ?? `${window.location.origin}/share/${track.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div>
      {variant === "sheet" && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <button
            type="button"
            onClick={p.closeSheet}
            aria-label={he.audio.close}
            className="-ms-2 grid h-10 w-10 place-items-center rounded-xl hover:bg-secondary hover:text-foreground"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
          <span>{he.player.nowPlaying}</span>
          <span className="w-10" />
        </div>
      )}

      {showTitle && (
        <div className={variant === "sheet" ? "mt-4" : ""}>
          <h2 dir="auto" className="text-balance text-2xl font-extrabold leading-tight tracking-tight sm:text-[28px]">
            {track.name}
          </h2>
          {track.subtitle && <p className="mt-1 text-sm text-muted-foreground">{track.subtitle}</p>}
        </div>
      )}

      <Waveform
        id={track.id}
        progress={progress}
        total={total}
        current={current}
        onSeek={(f) => p.seek(f * total)}
        label={he.audio.seek}
      />
      <div dir="ltr" className="mt-2.5 flex justify-between text-[13px] text-muted-foreground">
        <span className="num">{formatClock(current)}</span>
        <span className="num">-{formatClock(Math.max(0, total - current))}</span>
      </div>

      <div dir="ltr" className="mt-4 flex items-center justify-center gap-5">
        <button
          type="button"
          onClick={() => p.skip(-15)}
          aria-label={he.audio.back15}
          className="relative grid h-14 w-14 place-items-center rounded-full hover:bg-secondary"
        >
          <RotateCcw className="h-8 w-8" strokeWidth={1.6} />
          <span className="num absolute text-[10px] font-semibold">15</span>
        </button>
        <button
          type="button"
          onClick={p.toggle}
          aria-label={playing ? he.audio.pause : he.audio.play}
          className="grid h-[78px] w-[78px] place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_12px_28px_-8px_hsl(var(--primary)/0.7)] transition active:scale-95"
        >
          {playing ? (
            <Pause className="h-8 w-8 fill-current" />
          ) : (
            <Play className="h-8 w-8 translate-x-0.5 fill-current" />
          )}
        </button>
        <button
          type="button"
          onClick={() => p.skip(15)}
          aria-label={he.audio.forward15}
          className="relative grid h-14 w-14 place-items-center rounded-full hover:bg-secondary"
        >
          <RotateCw className="h-8 w-8" strokeWidth={1.6} />
          <span className="num absolute text-[10px] font-semibold">15</span>
        </button>
      </div>

      <div className="mt-6 flex items-center justify-between border-t pt-4">
        <button
          type="button"
          onClick={p.cycleSpeed}
          aria-label={he.audio.speed}
          className="num h-10 rounded-xl bg-secondary px-4 text-sm font-medium"
        >
          {speed}×
        </button>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={copyLink}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground",
              copied && "text-ok",
            )}
          >
            <Link2 className="h-4 w-4" />
            {copied ? he.file.shareCopiedShort : he.audio.copyLink}
          </button>
          <a
            href={track.src}
            download={`${track.name || "audio"}.mp3`}
            className="inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Download className="h-4 w-4" />
            MP3
          </a>
        </div>
      </div>
      {variant === "sheet" && track.persist && (
        <p className="mt-4 text-center text-xs text-muted-foreground">{he.audio.autosave}</p>
      )}
    </div>
  );
}
