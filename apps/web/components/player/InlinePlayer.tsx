"use client";

import { useEffect } from "react";
import { PlayerCard } from "@/components/player/PlayerCard";
import { usePlayer, type Track } from "@/components/player/context";

/**
 * Loads a track into the global player (without autoplay) and shows the
 * full player in the page. If the same track is already playing, it keeps going.
 */
export function InlinePlayer({ track, showTitle = false }: { track: Track; showTitle?: boolean }) {
  const { load } = usePlayer();
  useEffect(() => {
    load(track);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id, track.src]);
  return <PlayerCard variant="inline" showTitle={showTitle} />;
}
