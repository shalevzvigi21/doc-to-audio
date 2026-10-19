"use client";

import { useEffect, useRef, useState } from "react";
import { LifeBuoy } from "lucide-react";
import { OWNER_NAME, SUPPORT_EMAIL } from "@/lib/site";
import { he } from "@/lib/strings";

const MAX_CLIENT_ERRORS = 30;

/** Copyright line plus a button that downloads a problem report the user can send to the owner. */
export function SiteFooter() {
  const clientErrors = useRef<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Remember browser-side errors from page load so the report can include them.
  useEffect(() => {
    const push = (msg: string) => {
      clientErrors.current = [`${new Date().toISOString()} ${msg}`.slice(0, 500), ...clientErrors.current].slice(
        0,
        MAX_CLIENT_ERRORS,
      );
    };
    const onError = (e: ErrorEvent) => push(`${e.message} (${e.filename}:${e.lineno})`);
    const onRejection = (e: PromiseRejectionEvent) => push(`Unhandled rejection: ${String(e.reason)}`);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  const report = async () => {
    setBusy(true);
    let server: unknown = "(not signed in, or the server could not be reached)";
    try {
      const res = await fetch("/api/diagnostics", { cache: "no-store" });
      if (res.ok) server = await res.json();
      else server = `server answered ${res.status}`;
    } catch {
      /* keep the placeholder */
    }

    const text = [
      "Doc-to-Audio problem report",
      `Created: ${new Date().toISOString()}`,
      `Page: ${window.location.pathname}`,
      `Browser: ${navigator.userAgent}`,
      `Screen: ${window.innerWidth}x${window.innerHeight}`,
      "",
      "== Browser errors ==",
      clientErrors.current.join("\n") || "(none)",
      "",
      "== Server info ==",
      typeof server === "string" ? server : JSON.stringify(server, null, 2),
      "",
      "This report contains no passwords or API keys.",
    ].join("\n");

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `doc-to-audio-report-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    const subject = encodeURIComponent("דיווח על תקלה — מסמך לאודיו");
    const body = encodeURIComponent("שלום,\nנתקלתי בתקלה. מצורף קובץ הדיווח שהורד מהאפליקציה.\n\nמה ניסיתי לעשות:\n");
    window.open(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`, "_self");

    setBusy(false);
    setDone(true);
    setTimeout(() => setDone(false), 8000);
  };

  return (
    <footer className="mx-auto flex max-w-[620px] flex-col items-center gap-2 px-4 pb-28 pt-6 text-center text-xs text-muted-foreground">
      <button
        type="button"
        onClick={report}
        disabled={busy}
        className="inline-flex h-9 items-center gap-2 rounded-xl px-3 hover:bg-card hover:text-foreground disabled:opacity-60"
      >
        <LifeBuoy className="h-4 w-4" />
        {he.report.button}
      </button>
      {done && <p className="max-w-sm text-foreground">{he.report.done(SUPPORT_EMAIL)}</p>}
      <p dir="ltr">
        © {new Date().getFullYear()} {OWNER_NAME}. {he.report.rights}
      </p>
    </footer>
  );
}
