"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/utils";
import { savePositionAction } from "@/lib/actions/library";
import { he } from "@/lib/strings";

interface AudioPlayerProps {
  jobId: string;
  src: string;
  duration: number | null;
  initialPosition: number;
  downloadName?: string;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

export function AudioPlayer({
  jobId,
  src,
  duration,
  initialPosition,
  downloadName = "audio",
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(initialPosition);
  const [total, setTotal] = useState(duration ?? 0);
  const [rate, setRate] = useState(1);
  const lastSaved = useRef(initialPosition);

  const persist = useCallback(
    (position: number) => {
      if (Math.abs(position - lastSaved.current) < 1) return;
      lastSaved.current = position;
      void savePositionAction(jobId, position);
    },
    [jobId],
  );

  const handleLoadedMetadata = () => {
    const el = audioRef.current;
    if (!el) return;
    if (Number.isFinite(el.duration)) setTotal(el.duration);
    if (initialPosition > 0 && initialPosition < el.duration) {
      el.currentTime = initialPosition;
      setCurrent(initialPosition);
    }
  };

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  const skip = (delta: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.min(Math.max(0, el.currentTime + delta), total || el.duration || 0);
  };

  const onSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = audioRef.current;
    if (!el) return;
    const value = Number(e.target.value);
    el.currentTime = value;
    setCurrent(value);
  };

  const setSpeed = (s: number) => {
    const el = audioRef.current;
    if (el) el.playbackRate = s;
    setRate(s);
  };

  useEffect(() => {
    const handler = () => persist(audioRef.current?.currentTime ?? current);
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
      persist(audioRef.current?.currentTime ?? current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist]);

  const progress = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="flex flex-col gap-6">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          persist(audioRef.current?.currentTime ?? current);
        }}
        onTimeUpdate={() => {
          const t = audioRef.current?.currentTime ?? 0;
          setCurrent(t);
          if (Math.floor(t) % 10 === 0) persist(t);
        }}
        onEnded={() => { setPlaying(false); persist(0); }}
      />

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="absolute inset-y-0 start-0 rounded-full bg-primary transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
          <input
            type="range"
            min={0}
            max={total || 0}
            step={0.1}
            value={current}
            onChange={onSeek}
            aria-label={he.audio.seek}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
        <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
          <span>{formatTime(current)}</span>
          <span>{formatTime(total)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center gap-4">
        {/* Main transport row */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full"
            onClick={() => skip(-15)}
            aria-label={he.audio.back15}
          >
            <RotateCcw className="h-5 w-5" />
          </Button>

          <Button
            size="icon"
            className="h-16 w-16 rounded-full shadow-lg"
            onClick={togglePlay}
            aria-label={playing ? he.audio.pause : he.audio.play}
          >
            {playing ? (
              <Pause className="h-7 w-7" />
            ) : (
              <Play className="h-7 w-7 translate-x-0.5" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full"
            onClick={() => skip(15)}
            aria-label={he.audio.forward15}
          >
            <RotateCw className="h-5 w-5" />
          </Button>
        </div>

        {/* Speed pills */}
        <div className="flex items-center gap-1 rounded-full border bg-muted p-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={[
                "rounded-full px-3 py-1 text-xs font-medium tabular-nums transition-all",
                rate === s
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* Download */}
      <div className="flex justify-center">
        <Button asChild variant="outline" size="sm">
          <a href={src} download={`${downloadName}.mp3`}>
            <Download className="h-4 w-4" />
            {he.audio.download}
          </a>
        </Button>
      </div>
    </div>
  );
}
