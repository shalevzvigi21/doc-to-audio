"use client";

import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  FileText,
  Link2,
  Moon,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { cn, formatClock } from "@/lib/utils";
import { he } from "@/lib/strings";
import { mobileC } from "@/lib/mobile-strings-c";
import { usePlayer } from "@/components/player/context";
import { Waveform } from "@/components/player/Waveform";
import { Sheet, SheetAction } from "@/components/ui/sheet";
import {
  downloadForOffline,
  isOffline,
  offlineSupported,
  removeOffline,
} from "@/lib/offline";

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
  const { track, playing, current, total, speed, sleep } = p;
  const [copied, setCopied] = useState(false);
  const [docOpen, setDocOpen] = useState(false);

  // Sleep timer sheet & active state
  const [sleepSheetOpen, setSleepSheetOpen] = useState(false);
  const [chosenSleepMinutes, setChosenSleepMinutes] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Offline downloads state
  const [canOffline, setCanOffline] = useState(false);
  const [isSavedOffline, setIsSavedOffline] = useState(false);
  const [downloadingOffline, setDownloadingOffline] = useState(false);
  const [offlineProgress, setOfflineProgress] = useState<number | null>(null);

  useEffect(() => {
    if (variant !== "inline") return;
    return p.registerInline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  // Keep countdown updated when a minutes-based sleep timer is ticking
  useEffect(() => {
    if (sleep.kind !== "minutes" || !sleep.endsAt) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(interval);
  }, [sleep.kind, sleep.endsAt]);

  // Check offline support in browser
  useEffect(() => {
    setCanOffline(offlineSupported());
  }, []);

  // Check if current track is already cached offline
  useEffect(() => {
    if (!canOffline || !track?.id || !track.persist) {
      setIsSavedOffline(false);
      return;
    }
    let active = true;
    isOffline(track.id)
      .then((saved) => {
        if (active) setIsSavedOffline(saved);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [track?.id, track?.persist, canOffline]);

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

  const handleToggleOffline = async () => {
    if (downloadingOffline) return;
    try {
      if (isSavedOffline) {
        await removeOffline(track.id);
        setIsSavedOffline(false);
      } else {
        setDownloadingOffline(true);
        setOfflineProgress(0);
        await downloadForOffline(
          { id: track.id, name: track.name, duration: track.duration },
          (fraction) => {
            if (fraction >= 0) {
              setOfflineProgress(Math.round(fraction * 100));
            }
          },
        );
        setIsSavedOffline(true);
      }
    } catch {
      /* never throw */
    } finally {
      setDownloadingOffline(false);
      setOfflineProgress(null);
    }
  };

  const isSleepActive = sleep.kind !== "off";
  const remainingSleepMinutes =
    sleep.kind === "minutes" && sleep.endsAt
      ? Math.max(1, Math.ceil((sleep.endsAt - now) / 60_000))
      : null;

  const isApproxMinutes = (targetMin: number) => {
    if (sleep.kind !== "minutes" || !sleep.endsAt) return false;
    const diff = Math.round((sleep.endsAt - Date.now()) / 60_000);
    return Math.abs(diff - targetMin) <= 1;
  };

  return (
    <div>
      {variant === "sheet" && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <button
            type="button"
            onClick={p.closeSheet}
            aria-label={he.audio.close}
            className="-ms-2 grid h-11 w-11 place-items-center rounded-xl hover:bg-secondary hover:text-foreground active:scale-95"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
          <span>{he.player.nowPlaying}</span>
          <span className="w-11" />
        </div>
      )}

      {showTitle && (
        <div className={variant === "sheet" ? "mt-3" : ""}>
          <h2
            dir="auto"
            className="text-balance text-2xl font-extrabold leading-tight tracking-tight sm:text-[28px]"
          >
            {track.name}
          </h2>
          {track.subtitle && (
            <p className="mt-1 text-sm text-muted-foreground">{track.subtitle}</p>
          )}
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

      {/* Transport controls: 56px skip buttons, 78px play/pause button, dir="ltr" */}
      <div dir="ltr" className="mt-4 flex items-center justify-center gap-5">
        <button
          type="button"
          onClick={() => p.skip(-15)}
          aria-label={he.audio.back15}
          className="relative grid h-14 w-14 place-items-center rounded-full hover:bg-secondary active:scale-95 active:bg-secondary"
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
          className="relative grid h-14 w-14 place-items-center rounded-full hover:bg-secondary active:scale-95 active:bg-secondary"
        >
          <RotateCw className="h-8 w-8" strokeWidth={1.6} />
          <span className="num absolute text-[10px] font-semibold">15</span>
        </button>
      </div>

      {/* Action buttons: minimum 44px height, speed, sleep timer, offline toggle, mp3, copy link */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <div className="flex items-center gap-2">
          {/* Speed button: 44px tall showing e.g. "1.5×" */}
          <button
            type="button"
            onClick={p.cycleSpeed}
            aria-label={he.audio.speed}
            className="num inline-flex h-11 items-center justify-center rounded-xl bg-secondary px-3.5 text-sm font-medium transition active:scale-95 active:bg-secondary/80"
          >
            {speed}×
          </button>

          {/* Sleep timer button (Moon icon; when active shows remaining minutes or "בסוף") */}
          <button
            type="button"
            onClick={() => setSleepSheetOpen(true)}
            aria-label={mobileC.sleep.ariaLabel}
            className={cn(
              "inline-flex h-11 items-center gap-1.5 rounded-xl px-3.5 text-sm transition active:scale-95",
              isSleepActive
                ? "bg-primary/15 text-primary font-medium"
                : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
            )}
          >
            <Moon className="h-4 w-4 shrink-0" />
            {isSleepActive && (
              <span className="text-xs font-semibold">
                {sleep.kind === "end"
                  ? mobileC.sleep.endShort
                  : mobileC.sleep.minutesLeft(remainingSleepMinutes ?? 0)}
              </span>
            )}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {/* Download for offline toggle: only when offlineSupported() and track.persist is true */}
          {canOffline && track.persist && (
            <button
              type="button"
              onClick={handleToggleOffline}
              disabled={downloadingOffline}
              aria-label={
                downloadingOffline
                  ? mobileC.offline.downloading(offlineProgress ?? 0)
                  : isSavedOffline
                    ? mobileC.offline.removeAria
                    : mobileC.offline.buttonAria
              }
              className={cn(
                "inline-flex h-11 items-center gap-1.5 rounded-xl px-3.5 text-sm transition active:scale-95",
                isSavedOffline
                  ? "bg-ok/15 text-ok font-medium"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                downloadingOffline && "pointer-events-none opacity-80",
              )}
            >
              {downloadingOffline ? (
                <span className="num text-xs font-semibold">
                  {offlineProgress ?? 0}%
                </span>
              ) : isSavedOffline ? (
                <>
                  <Check className="h-4 w-4 shrink-0" />
                  <span className="text-xs">{mobileC.offline.saved}</span>
                </>
              ) : (
                <>
                  <ArrowDownToLine className="h-4 w-4 shrink-0" />
                  <span className="text-xs">{mobileC.offline.label}</span>
                </>
              )}
            </button>
          )}

          {/* MP3 download link: 44px tall */}
          <a
            href={track.src}
            download={`${track.name || "audio"}.mp3`}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground active:scale-95"
          >
            <Download className="h-4 w-4 shrink-0" />
            <span>MP3</span>
          </a>

          {/* Copy link button: 44px tall */}
          <button
            type="button"
            onClick={copyLink}
            className={cn(
              "inline-flex h-11 items-center gap-1.5 rounded-xl px-3.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground active:scale-95",
              copied && "text-ok",
            )}
          >
            <Link2 className="h-4 w-4 shrink-0" />
            <span>{copied ? he.file.shareCopiedShort : he.audio.copyLink}</span>
          </button>
        </div>
      </div>

      {/* Sleep timer Sheet */}
      <Sheet
        open={sleepSheetOpen}
        onClose={() => setSleepSheetOpen(false)}
        title={mobileC.sleep.title}
      >
        <div className="flex flex-col gap-1 py-1">
          <SheetAction
            label={mobileC.sleep.off}
            selected={sleep.kind === "off"}
            onClick={() => {
              p.setSleep(null);
              setChosenSleepMinutes(null);
              setSleepSheetOpen(false);
            }}
          />
          <SheetAction
            label={mobileC.sleep.min15}
            selected={
              sleep.kind === "minutes" &&
              (chosenSleepMinutes === 15 || (!chosenSleepMinutes && isApproxMinutes(15)))
            }
            onClick={() => {
              p.setSleep(15);
              setChosenSleepMinutes(15);
              setSleepSheetOpen(false);
            }}
          />
          <SheetAction
            label={mobileC.sleep.min30}
            selected={
              sleep.kind === "minutes" &&
              (chosenSleepMinutes === 30 || (!chosenSleepMinutes && isApproxMinutes(30)))
            }
            onClick={() => {
              p.setSleep(30);
              setChosenSleepMinutes(30);
              setSleepSheetOpen(false);
            }}
          />
          <SheetAction
            label={mobileC.sleep.min60}
            selected={
              sleep.kind === "minutes" &&
              (chosenSleepMinutes === 60 || (!chosenSleepMinutes && isApproxMinutes(60)))
            }
            onClick={() => {
              p.setSleep(60);
              setChosenSleepMinutes(60);
              setSleepSheetOpen(false);
            }}
          />
          <SheetAction
            label={mobileC.sleep.endOfDoc}
            selected={sleep.kind === "end"}
            onClick={() => {
              p.setSleep("end");
              setChosenSleepMinutes(null);
              setSleepSheetOpen(false);
            }}
          />
        </div>
      </Sheet>

      {/* Document viewer: on max-sm hide toggle and show only open-in-new-tab link; on sm: keep toggle + iframe */}
      {track.doc && (
        <div className="mt-4 border-t pt-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDocOpen((v) => !v)}
              aria-expanded={docOpen}
              className="hidden sm:inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-secondary text-sm font-medium hover:bg-secondary/80 active:scale-[0.98]"
            >
              <FileText className="h-4 w-4" />
              {docOpen ? he.player.hideDoc : he.player.showDoc}
            </button>

            <a
              href={`/api/files/${track.doc.fileId}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={he.player.openDoc}
              title={he.player.openDoc}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-secondary px-4 text-sm font-medium hover:bg-secondary/80 active:scale-[0.98] sm:h-11 sm:w-11 sm:p-0 sm:grid sm:place-items-center"
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              <span className="sm:hidden">{he.player.openDoc}</span>
            </a>
          </div>

          {docOpen && (
            <div className="hidden sm:block">
              {track.doc.mimeType === "application/pdf" ? (
                <iframe
                  src={`/api/files/${track.doc.fileId}`}
                  title={track.doc.name}
                  className="mt-3 h-[60vh] w-full rounded-xl border"
                />
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {he.player.viewDocUnsupported}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {variant === "sheet" && track.persist && (
        <p className="mt-4 text-center text-xs text-muted-foreground">{he.audio.autosave}</p>
      )}
    </div>
  );
}
