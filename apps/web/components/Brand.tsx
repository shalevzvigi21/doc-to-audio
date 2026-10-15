import Link from "next/link";
import { cn } from "@/lib/utils";
import { he } from "@/lib/strings";

/** App mark: four sound bars on a dark tile. */
export function BrandMark({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <span
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
        onDark ? "bg-secondary" : "bg-foreground",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <rect x="3" y="9" width="2.6" height="6" rx="1.3" fill="#F2501F" />
        <rect x="8" y="5" width="2.6" height="14" rx="1.3" fill="#F2501F" />
        <rect x="13" y="8" width="2.6" height="8" rx="1.3" fill="#F2501F" />
        <rect x="18" y="3" width="2.6" height="18" rx="1.3" fill="#F2501F" />
      </svg>
    </span>
  );
}

export function Brand({ href = "/library", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5 text-[19px] font-extrabold tracking-tight", className)}>
      <BrandMark />
      {he.app.title}
    </Link>
  );
}

/** Animated equalizer bars, purely decorative. */
export function Equalizer({
  count,
  peak = 66,
  className,
  barClassName,
}: {
  count: number;
  peak?: number;
  className?: string;
  barClassName?: string;
}) {
  return (
    <div
      dir="ltr"
      aria-hidden="true"
      className={cn("flex items-center", className)}
      style={{ ["--eq-peak" as string]: `${peak}px` }}
    >
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          className={cn("animate-eq rounded bg-primary", barClassName)}
          style={{
            animationDelay: `${(-(i * 0.17) % 1.3).toFixed(2)}s`,
            animationDuration: `${(0.9 + ((i * 37) % 7) / 10).toFixed(1)}s`,
          }}
        />
      ))}
    </div>
  );
}
