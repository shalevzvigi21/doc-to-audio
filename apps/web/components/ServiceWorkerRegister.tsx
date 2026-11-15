"use client";

import { useEffect } from "react";
import { captureInstallPrompt } from "@/lib/install";

/** Registers the service worker (production only) and captures the install prompt. Renders nothing. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    const stop = captureInstallPrompt();
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* offline features simply stay off */
      });
    }
    return stop;
  }, []);
  return null;
}
