/**
 * "Install app" helpers. Android Chrome fires `beforeinstallprompt`; we keep the
 * event so any button can trigger the native install dialog later. iOS has no such
 * event, so there we only detect the platform and show a manual hint.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export const INSTALL_AVAILABLE = "install-available";

let deferred: BeforeInstallPromptEvent | null = null;

/** Call once on the client (done by ServiceWorkerRegister). */
export function captureInstallPrompt(): () => void {
  const onPrompt = (e: Event) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event(INSTALL_AVAILABLE));
  };
  const onInstalled = () => {
    deferred = null;
    window.dispatchEvent(new Event(INSTALL_AVAILABLE));
  };
  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);
  return () => {
    window.removeEventListener("beforeinstallprompt", onPrompt);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

export function canPromptInstall(): boolean {
  return deferred !== null;
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const choice = await deferred.userChoice;
  deferred = null;
  window.dispatchEvent(new Event(INSTALL_AVAILABLE));
  return choice.outcome === "accepted";
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOS;
}

/** True when running as an installed app (home-screen launch). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
