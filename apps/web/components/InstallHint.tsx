"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import {
  INSTALL_AVAILABLE,
  canPromptInstall,
  isIOS,
  isStandalone,
  promptInstall,
} from "@/lib/install";
import { mobileB1 } from "@/lib/mobile-strings-b1";

const IOS_DISMISSED_KEY = "ios-install-dismissed";

/**
 * Row used in the status sheet:
 * - Hidden when running in standalone mode (already installed).
 * - On iOS: shows an instruction card with Share icon.
 * - On Android: shows a button calling promptInstall() when available.
 */
export function InstallRow() {
  const [mounted, setMounted] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [isIosDevice, setIsIosDevice] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setMounted(true);
    setStandalone(isStandalone());
    setCanInstall(canPromptInstall());
    setIsIosDevice(isIOS());

    const onAvailable = () => {
      setCanInstall(canPromptInstall());
      setStandalone(isStandalone());
    };

    window.addEventListener(INSTALL_AVAILABLE, onAvailable);
    return () => window.removeEventListener(INSTALL_AVAILABLE, onAvailable);
  }, []);

  if (!mounted || standalone || installed) {
    return null;
  }

  if (isIosDevice) {
    return (
      <div className="flex items-center gap-3.5 rounded-2xl border bg-card p-3.5 text-start">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
          <Share className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">
            {mobileB1.install.button}
          </div>
          <div className="text-xs text-muted-foreground">
            {mobileB1.install.iosShare}
          </div>
        </div>
      </div>
    );
  }

  if (canInstall) {
    const handleInstall = async () => {
      const accepted = await promptInstall();
      if (accepted) {
        setInstalled(true);
      }
    };

    return (
      <button
        type="button"
        onClick={handleInstall}
        className="flex h-[52px] w-full items-center gap-3.5 rounded-2xl border bg-card px-4 text-start font-medium text-foreground transition hover:bg-secondary active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Download className="h-5 w-5 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">{mobileB1.install.button}</span>
      </button>
    );
  }

  return null;
}

/**
 * Dismissible banner shown once at the top of the library on iOS Safari
 * when not running as a standalone app.
 */
export function IosInstallBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isIOS() || isStandalone()) {
      return;
    }
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(IOS_DISMISSED_KEY) === "1";
    } catch {
      /* ignore storage access restrictions */
    }
    if (!dismissed) {
      setShow(true);
    }
  }, []);

  if (!show) {
    return null;
  }

  const handleDismiss = () => {
    try {
      localStorage.setItem(IOS_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  return (
    <div
      role="region"
      aria-label={mobileB1.install.iosBannerTitle}
      className="my-3 flex items-center justify-between gap-3.5 rounded-2xl border bg-card p-3.5 text-start shadow-sm sm:my-4 sm:p-4"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
          <Share className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-foreground">
            {mobileB1.install.iosBannerTitle}
          </div>
          <div className="text-xs leading-relaxed text-muted-foreground">
            {mobileB1.install.iosShare}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={mobileB1.install.dismiss}
        className="-me-1 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted-foreground transition hover:bg-secondary hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
