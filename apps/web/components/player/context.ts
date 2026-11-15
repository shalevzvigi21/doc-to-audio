"use client";

import { createContext, useContext } from "react";

export interface Track {
  id: string;
  name: string;
  src: string;
  duration: number | null;
  /** Where to start, in seconds (the saved resume position). */
  position: number;
  /** Save the listening position to the API. Off for the public share page. */
  persist: boolean;
  /** Small line under the title, e.g. "PDF · לימודים". */
  subtitle?: string;
  /** Original document, shown inside the player. Omitted on the public share page. */
  doc?: { fileId: string; mimeType: string; name: string };
}

/** Sleep timer: pause after N minutes, or when the current document ends. */
export interface SleepTimer {
  kind: "off" | "minutes" | "end";
  /** Epoch ms when it fires (only for kind "minutes"). */
  endsAt: number | null;
}

export interface PlayerContextValue {
  track: Track | null;
  playing: boolean;
  current: number;
  total: number;
  speed: number;
  sheetOpen: boolean;
  sleep: SleepTimer;
  /** Minutes, "end" (stop when the document ends) or null to turn the timer off. */
  setSleep: (value: number | "end" | null) => void;
  /**
   * Load a track. Without `autoplay` this only prepares it. With `autoplay`
   * it starts playing, or toggles play/pause if the track is already loaded.
   */
  load: (track: Track, opts?: { autoplay?: boolean }) => void;
  toggle: () => void;
  /** Stop playback and forget the track (used on logout so nothing keeps playing or shows on the lock screen). */
  stop: () => void;
  seek: (seconds: number) => void;
  skip: (delta: number) => void;
  cycleSpeed: () => void;
  openSheet: () => void;
  closeSheet: () => void;
  /** An inline player card is on screen, so the mini-player stays hidden. */
  registerInline: () => () => void;
  inlineActive: boolean;
}

export const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside <PlayerProvider>");
  return ctx;
}
