"use client";

import { useState } from "react";
import { Info, Scissors } from "lucide-react";
import { he } from "@/lib/strings";

/**
 * Example page for the "important to know" panel. Drop the picture at
 * apps/web/public/tips/crop-example.jpg and it appears automatically; until then a
 * drawn schematic of the same layout is shown.
 */
const EXAMPLE_SRC = "/tips/crop-example.jpg";

/**
 * Where the irrelevant side column sits on the example page, as a share of the
 * image (the page is read right to left, so the margin gloss is on the right).
 */
const IRRELEVANT = { top: "20%", height: "27%", width: "29%" };

function Schematic() {
  // A stand-in page: a headline, the main paragraph, and the narrow side note to cut.
  return (
    <svg viewBox="0 0 745 270" role="img" aria-label={he.tips.exampleAlt} className="h-auto w-full bg-white">
      <rect x="150" y="26" width="480" height="12" rx="3" fill="#9a9a9a" />
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x="20" y={70 + i * 22} width={i === 7 ? 300 : 500} height="9" rx="3" fill="#c7c7c7" />
      ))}
      <rect x="560" y="64" width="150" height="10" rx="3" fill="#9a9a9a" />
      <rect x="560" y="82" width="120" height="8" rx="3" fill="#c7c7c7" />
    </svg>
  );
}

/** The "חשוב לדעת!" button and the panel it opens, with the example and the part to cut out. */
export function ImportantToKnow() {
  const [open, setOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div className="w-full">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-warn/50 bg-warn/10 px-4 text-sm font-semibold text-warn hover:brightness-95"
      >
        <Info className="h-4 w-4" />
        {he.tips.button}
      </button>

      {open && (
        <div className="mt-3 max-w-[560px] space-y-3 rounded-2xl border bg-card p-4 text-sm leading-relaxed">
          <p>{he.tips.intro}</p>
          <p className="font-medium">{he.tips.help}</p>
          <p>{he.tips.advice}</p>

          <figure className="space-y-2">
            {/* dir=ltr so "right" below means the physical right edge of the picture */}
            <div dir="ltr" className="relative overflow-hidden rounded-xl border">
              {imageFailed ? (
                <Schematic />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={EXAMPLE_SRC}
                  alt={he.tips.exampleAlt}
                  className="block h-auto w-full"
                  onError={() => setImageFailed(true)}
                />
              )}
              <div
                className="absolute right-0 flex items-start justify-center rounded-md border-2 border-dashed border-red-600 bg-red-500/15"
                style={IRRELEVANT}
              >
                <span className="mt-1 inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                  <Scissors className="h-3 w-3" />
                  {he.tips.cutLabel}
                </span>
              </div>
            </div>
            <figcaption className="text-xs text-muted-foreground">{he.tips.caption}</figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}
