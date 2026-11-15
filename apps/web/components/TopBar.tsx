"use client";

import { useState } from "react";
import Link from "next/link";
import { SlidersHorizontal, Users } from "lucide-react";
import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { StatusSheet } from "@/components/StatusSheet";
import { mobileB1 } from "@/lib/mobile-strings-b1";
import { mobileAdmin } from "@/lib/mobile-strings-admin";
import type { TtsQuotaResponse } from "@doc-to-audio/types";

/** Page header: brand on one side, page tools on the other. */
export function TopBar({
  children,
  quota,
  isAdmin,
}: {
  children?: React.ReactNode;
  quota?: TtsQuotaResponse | null;
  isAdmin?: boolean;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <header className="flex items-center justify-between gap-3 py-3.5">
      <Brand />
      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-2">
          {isAdmin && (
            <Link
              href="/admin"
              className="inline-flex h-10 items-center gap-1.5 rounded-full border bg-card px-4 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              <Users className="h-4 w-4" />
              {mobileAdmin.header.title}
            </Link>
          )}
          {children}
          <ThemeToggle />
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label={mobileB1.status.openAria}
          className="sm:hidden grid h-11 w-11 shrink-0 place-items-center rounded-full border bg-card text-muted-foreground transition hover:bg-secondary hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SlidersHorizontal className="h-5 w-5" />
        </button>
      </div>
      <StatusSheet open={sheetOpen} onClose={() => setSheetOpen(false)} quota={quota} isAdmin={isAdmin} />
    </header>
  );
}
