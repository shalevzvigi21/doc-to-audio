"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { he } from "@/lib/strings";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  fullScreenOnPhone?: boolean;
  children?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sheet({
  open,
  onClose,
  title,
  fullScreenOnPhone = false,
  children,
  className,
  contentClassName,
}: SheetProps) {
  const titleId = React.useId();
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const prevActiveElementRef = React.useRef<HTMLElement | null>(null);

  const [dragY, setDragY] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const dragStartRef = React.useRef<{ y: number; time: number } | null>(null);

  // Lock body scroll while open
  React.useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  // Focus trap and return focus on close
  React.useEffect(() => {
    if (!open) return;

    prevActiveElementRef.current = document.activeElement as HTMLElement | null;

    const rafId = requestAnimationFrame(() => {
      const dialogEl = dialogRef.current;
      if (!dialogEl) return;
      const focusables = dialogEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        dialogEl.focus();
      }
    });

    return () => {
      cancelAnimationFrame(rafId);
      try {
        prevActiveElementRef.current?.focus();
      } catch {
        // Element might be unmounted; ignore
      }
    };
  }, [open]);

  // Escape key and tab key trapping
  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === "Tab") {
        const dialogEl = dialogRef.current;
        if (!dialogEl) return;

        const focusables = Array.from(
          dialogEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        ).filter(
          (el) => el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0,
        );

        if (focusables.length === 0) {
          e.preventDefault();
          dialogEl.focus();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !dialogEl.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !dialogEl.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  // Swipe-down pointer gesture on handle/header
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, a, input, textarea, select")) {
      return;
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    dragStartRef.current = { y: e.clientY, time: Date.now() };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const deltaY = e.clientY - dragStartRef.current.y;
    setDragY(deltaY > 0 ? deltaY : 0);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const deltaY = e.clientY - dragStartRef.current.y;
    const elapsed = Date.now() - dragStartRef.current.time;
    const velocity = elapsed > 0 ? deltaY / elapsed : 0;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    dragStartRef.current = null;
    setIsDragging(false);

    // Threshold 80px or fast flick (e.g. >20px with velocity > 0.5px/ms)
    if (deltaY >= 80 || (deltaY > 20 && velocity > 0.5)) {
      onClose();
    }
    setDragY(0);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    dragStartRef.current = null;
    setIsDragging(false);
    setDragY(0);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-black/55 backdrop-blur-md sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={!title ? "Dialog" : undefined}
        tabIndex={-1}
        style={
          dragY > 0
            ? {
                transform: `translateY(${dragY}px)`,
                transition: isDragging ? "none" : "transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)",
              }
            : undefined
        }
        className={cn(
          "relative flex w-full max-w-[620px] flex-col animate-sheet-up bg-background shadow-2xl focus:outline-none",
          fullScreenOnPhone
            ? "max-sm:h-dvh max-sm:rounded-none max-sm:pt-[env(safe-area-inset-top,0px)] sm:h-auto sm:max-h-[92dvh] sm:rounded-[32px]"
            : "max-h-[92dvh] rounded-t-[32px] sm:rounded-[32px]",
          className,
        )}
      >
        {/* Drag handle & header area */}
        <div
          className="flex shrink-0 cursor-grab touch-none select-none flex-col px-6 pt-3 pb-2 active:cursor-grabbing"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          {/* Drag handle bar */}
          <div
            className="mx-auto mb-3 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/30"
            aria-hidden="true"
          />

          {/* Header row with title and close button */}
          <div className="flex items-center justify-between gap-4">
            {title ? (
              <h2
                id={titleId}
                dir="auto"
                className="text-balance text-lg font-bold tracking-tight text-foreground"
              >
                {title}
              </h2>
            ) : (
              <span className="sr-only">Dialog</span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={he.audio.close}
              className="-me-2 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable content inside */}
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-[calc(16px+env(safe-area-inset-bottom,0px))]",
            contentClassName,
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export interface SheetActionProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode | React.ComponentType<{ className?: string }>;
  label?: React.ReactNode;
  children?: React.ReactNode;
  danger?: boolean;
  selected?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}

function renderActionIcon(icon: SheetActionProps["icon"]) {
  if (!icon) return null;
  if (React.isValidElement(icon)) return icon;
  if (typeof icon === "function" || (typeof icon === "object" && "render" in (icon as object))) {
    const IconComp = icon as React.ComponentType<{ className?: string }>;
    return <IconComp className="h-5 w-5" />;
  }
  return icon as React.ReactNode;
}

export const SheetAction = React.forwardRef<HTMLButtonElement, SheetActionProps>(
  (
    {
      icon,
      label,
      children,
      danger = false,
      selected = false,
      onClick,
      className,
      disabled,
      type = "button",
      ...props
    },
    ref,
  ) => {
    const content = label ?? children;

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        onClick={onClick}
        aria-selected={selected ? true : undefined}
        className={cn(
          "flex h-[56px] w-full items-center gap-3.5 rounded-2xl px-4 text-start font-medium transition active:scale-[0.98]",
          "hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          danger
            ? "text-destructive hover:bg-destructive/10 active:bg-destructive/15"
            : selected
              ? "bg-secondary/60 font-semibold text-foreground"
              : "text-foreground",
          disabled && "pointer-events-none opacity-50",
          className,
        )}
        {...props}
      >
        {icon && (
          <span
            aria-hidden="true"
            className={cn(
              "grid h-6 w-6 shrink-0 place-items-center text-muted-foreground [&>svg]:h-5 [&>svg]:w-5",
              danger && "text-destructive",
              selected && "text-primary",
            )}
          >
            {renderActionIcon(icon)}
          </span>
        )}
        <span dir="auto" className="min-w-0 flex-1 truncate text-base">
          {content}
        </span>
        {selected && (
          <Check
            className={cn(
              "ms-auto h-5 w-5 shrink-0",
              danger ? "text-destructive" : "text-primary",
            )}
            aria-hidden="true"
          />
        )}
      </button>
    );
  },
);

SheetAction.displayName = "SheetAction";
