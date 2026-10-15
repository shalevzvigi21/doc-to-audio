"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { savePositionAction } from "@/lib/actions/library";
import { PlayerChrome } from "@/components/player/PlayerChrome";
import { PlayerContext, type PlayerContextValue, type Track } from "@/components/player/context";

const SPEEDS = [1, 1.25, 1.5, 1.75, 2, 0.75];
const SAVE_EVERY_MS = 10_000;

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
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [persist]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      track,
      playing,
      current,
      total,
      speed,
      sheetOpen,
      load,
      toggle,
      seek,
      skip,
      cycleSpeed,
      openSheet: () => setSheetOpen(true),
      closeSheet: () => setSheetOpen(false),
      registerInline,
      inlineActive: inlineCount > 0,
    }),
    [track, playing, current, total, speed, sheetOpen, inlineCount, load, toggle, seek, skip, cycleSpeed, registerInline],
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
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          persist();
        }}
        onTimeUpdate={() => {
          const t = audioRef.current?.currentTime ?? 0;
          setCurrent(t);
          if (Date.now() - lastSaved.current.at > SAVE_EVERY_MS) persist();
        }}
        onEnded={() => {
          setPlaying(false);
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
