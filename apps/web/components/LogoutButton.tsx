"use client";

import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";
import { purgeOffline } from "@/lib/offline";
import { usePlayer } from "@/components/player/context";
import { he } from "@/lib/strings";

export function LogoutButton() {
  const player = usePlayer();

  return (
    <form
      action={logoutAction}
      onSubmit={() => {
        // Shared-phone safety: stop playback, clear the lock-screen info, and delete downloaded audio
        // (browser storage is per profile, not per account).
        player.stop();
        void purgeOffline();
      }}
    >
      <button
        type="submit"
        aria-label={he.library.signOut}
        title={he.library.signOut}
        className="grid h-[38px] w-[38px] place-items-center rounded-xl text-muted-foreground hover:bg-card hover:text-foreground max-sm:h-11 max-sm:w-11"
      >
        <LogOut className="h-5 w-5" />
      </button>
    </form>
  );
}
