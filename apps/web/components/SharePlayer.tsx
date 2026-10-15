"use client";

import { InlinePlayer } from "@/components/player/InlinePlayer";

/** Public share page player: no position saving, no account needed. */
export function SharePlayer({ jobId }: { jobId: string }) {
  return (
    <InlinePlayer
      track={{
        id: jobId,
        name: "",
        src: `/api/audio/public/${jobId}`,
        duration: null,
        position: 0,
        persist: false,
      }}
    />
  );
}
