"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { savePositionAction } from "@/lib/actions/library";
import { PlayerChrome } from "@/components/player/PlayerChrome";
import { PlayerContext, type PlayerContextValue, type SleepTimer, type Track } from "@/components/player/context";
import { he } from "@/lib/strings";

const SPEEDS = [1, 1.25, 1.5, 1.75, 2, 0.75];
const SAVE_EVERY_MS = 10_000;
const POSITION_STATE_EVERY_MS = 5_000;
const SEEK_STEP = 15;
const ARTWORK = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
];

/**
 * Owns the single <audio> element for the whole app. It lives in the root
 * layout, so playback keeps going while you move between pages, and the
 * mini-player can follow you around the library.
 */
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<Track | null>(null);
  const startAtRef = useRef(0);
  const autoplayRef = useRef(false);
  const lastSaved = useRef({ t: 0, at: 0 });
  const speedRef = useRef(1);

  const [track, setTrack] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [inlineCount, setInlineCount] = useState(0);
  const [sleep, setSleepState] = useState<SleepTimer>({ kind: "off", endsAt: null });
  const sleepRef = useRef<SleepTimer>(sleep);
  const sleepTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPositionState = useRef(0);

  /** Keep the OS (lock screen / notification) progress bar in step with the audio. */
  const updatePositionState = useCallback(() => {
    const el = audioRef.current;
    if (!el || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const duration = el.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: el.playbackRate || 1,
        position: Math.min(Math.max(0, el.currentTime), duration),
      });
      lastPositionState.current = Date.now();
    } catch {
      /* some browsers reject odd values; the lock screen just shows no progress */
    }
  }, []);

  const setSleep = useCallback((value: number | "end" | null) => {
    if (sleepTimeout.current) clearTimeout(sleepTimeout.current);
    sleepTimeout.current = null;
    let next: SleepTimer = { kind: "off", endsAt: null };
    if (value === "end") {
      next = { kind: "end", endsAt: null };
    } else if (typeof value === "number" && value > 0) {
      const endsAt = Date.now() + value * 60_000;
      next = { kind: "minutes", endsAt };
      sleepTimeout.current = setTimeout(() => {
        audioRef.current?.pause();
        sleepRef.current = { kind: "off", endsAt: null };
        setSleepState(sleepRef.current);
      }, value * 60_000);
    }
    sleepRef.current = next;
    setSleepState(next);
  }, []);

  useEffect(
    () => () => {
      if (sleepTimeout.current) clearTimeout(sleepTimeout.current);
    },
    [],
  );

  const persist = useCallback(() => {
    const tr = trackRef.current;
    const el = audioRef.current;
    if (!tr || !tr.persist || !el) return;
    const t = el.currentTime;
    if (!Number.isFinite(t) || Math.abs(t - lastSaved.current.t) < 1) return;
    lastSaved.current = { t, at: Date.now() };
    void savePositionAction(tr.id, t);
  }, []);

  const play = useCallback(() => {
    void audioRef.current?.play().catch(() => {
      /* blocked by the browser until the user interacts */
    });
  }, []);

  const load = useCallback<PlayerContextValue["load"]>(
    (next, opts) => {
      const el = audioRef.current;
      if (!el) return;
      const cur = trackRef.current;
      if (cur && cur.id === next.id && cur.src === next.src) {
        if (opts?.autoplay) {
          if (el.paused) play();
          else el.pause();
        }
        return;
      }
      persist();
      trackRef.current = next;
      setTrack(next);
      lastSaved.current = { t: next.position, at: Date.now() };
      startAtRef.current = next.position;
      autoplayRef.current = Boolean(opts?.autoplay);
      setCurrent(next.position);
      setTotal(next.duration ?? 0);
      setPlaying(false);
      el.defaultPlaybackRate = speedRef.current;
      el.src = next.src;
      el.load();
      el.playbackRate = speedRef.current;
      if (opts?.autoplay) play();
    },
    [persist, play],
  );

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el || !trackRef.current) return;
    if (el.paused) play();
    else el.pause();
  }, [play]);

  const stop = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    persist();
    el.pause();
    el.removeAttribute("src");
    el.load();
    trackRef.current = null;
    setTrack(null);
    setPlaying(false);
    setCurrent(0);
    setTotal(0);
    setSheetOpen(false);
    setSleep(null);
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
    }
  }, [persist, setSleep]);

  const seek = useCallback((seconds: number) => {
    const el = audioRef.current;
    if (!el) return;
    const max = Number.isFinite(el.duration) ? el.duration : seconds;
    const t = Math.min(Math.max(0, seconds), max);
    el.currentTime = t;
    setCurrent(t);
  }, []);

  const skip = useCallback(
    (delta: number) => {
      const el = audioRef.current;
      if (el) seek(el.currentTime + delta);
    },
    [seek],
  );

  const cycleSpeed = useCallback(() => {
    const next = SPEEDS[(SPEEDS.indexOf(speedRef.current) + 1) % SPEEDS.length];
    speedRef.current = next;
    setSpeed(next);
    const el = audioRef.current;
    if (el) {
      el.defaultPlaybackRate = next;
      el.playbackRate = next;
    }
  }, []);

  const registerInline = useCallback(() => {
    setInlineCount((n) => n + 1);
    return () => setInlineCount((n) => n - 1);
  }, []);

  useEffect(() => {
    const onUnload = () => persist();
    // beforeunload rarely fires on phones; the page is "hidden" when the user switches apps or locks the screen.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") persist();
    };
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("pagehide", onUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("pagehide", onUnload);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [persist]);

  // Lock-screen / notification metadata for the current track.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!track) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.name,
      artist: he.app.title,
      album: track.subtitle ?? he.app.title,
      artwork: ARTWORK,
    });
  }, [track]);

  // Lock-screen / headset / notification buttons. Registered once; they only touch refs and stable callbacks.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        /* action not supported on this browser */
      }
    };
    set("play", () => play());
    set("pause", () => audioRef.current?.pause());
    set("stop", () => audioRef.current?.pause());
    set("seekbackward", (d) => skip(-(d.seekOffset ?? SEEK_STEP)));
    set("seekforward", (d) => skip(d.seekOffset ?? SEEK_STEP));
    set("seekto", (d) => {
      if (d.seekTime == null) return;
      seek(d.seekTime);
      updatePositionState();
    });
    return () => {
      (["play", "pause", "stop", "seekbackward", "seekforward", "seekto"] as MediaSessionAction[]).forEach((a) =>
        set(a, null),
      );
    };
  }, [play, seek, skip, updatePositionState]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      track,
      playing,
      current,
      total,
      speed,
      sheetOpen,
      sleep,
      setSleep,
      load,
      toggle,
      stop,
      seek,
      skip,
      cycleSpeed,
      openSheet: () => setSheetOpen(true),
      closeSheet: () => setSheetOpen(false),
      registerInline,
      inlineActive: inlineCount > 0,
    }),
    [track, playing, current, total, speed, sheetOpen, sleep, setSleep, inlineCount, load, toggle, stop, seek, skip, cycleSpeed, registerInline],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        preload="metadata"
        onLoadedMetadata={() => {
          const el = audioRef.current;
          if (!el) return;
          if (Number.isFinite(el.duration)) setTotal(el.duration);
          const start = startAtRef.current;
          if (start > 0 && start < el.duration) {
            el.currentTime = start;
            setCurrent(start);
          }
          startAtRef.current = 0;
          updatePositionState();
        }}
        onDurationChange={updatePositionState}
        onRateChange={updatePositionState}
        onSeeked={updatePositionState}
        onPlay={() => {
          setPlaying(true);
          if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
          updatePositionState();
        }}
        onPause={() => {
          setPlaying(false);
          if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
          persist();
          updatePositionState();
        }}
        onTimeUpdate={() => {
          const t = audioRef.current?.currentTime ?? 0;
          setCurrent(t);
          if (Date.now() - lastSaved.current.at > SAVE_EVERY_MS) persist();
          if (Date.now() - lastPositionState.current > POSITION_STATE_EVERY_MS) updatePositionState();
          // Phones throttle setTimeout in the background, but media events keep firing: re-check the sleep timer here.
          const s = sleepRef.current;
          if (s.kind === "minutes" && s.endsAt !== null && Date.now() >= s.endsAt) {
            audioRef.current?.pause();
            setSleep(null);
          }
        }}
        onEnded={() => {
          setPlaying(false);
          if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "none";
          // "stop at the end" sleep timer is done once the document finishes.
          if (sleepRef.current.kind === "end") setSleep(null);
          const tr = trackRef.current;
          if (tr?.persist) {
            lastSaved.current = { t: 0, at: Date.now() };
            void savePositionAction(tr.id, 0);
          }
        }}
      />
      <PlayerChrome />
    </PlayerContext.Provider>
  );
}
