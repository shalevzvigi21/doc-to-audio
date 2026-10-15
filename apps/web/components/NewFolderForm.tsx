"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Plus } from "lucide-react";
import { createFolderAction } from "@/lib/actions/library";
import type { ActionResult } from "@/lib/actions/types";
import { he } from "@/lib/strings";

function Field() {
  const { pending } = useFormStatus();
  return (
    <input
      name="name"
      required
      autoFocus
      autoComplete="off"
      disabled={pending}
      placeholder={he.library.folderNamePlaceholder}
      aria-label={he.library.folderNamePlaceholder}
      className="h-[38px] w-40 rounded-full border border-primary bg-card px-3.5 text-sm outline-none disabled:opacity-60"
    />
  );
}

/** "+ New folder" chip that turns into an inline name field. */
export default function NewFolderForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<ActionResult, FormData>(createFolderAction, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      ref.current?.reset();
      setOpen(false);
    }
  }, [state]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed px-4 text-sm text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
        {he.library.newFolderChip}
      </button>
    );
  }

  return (
    <form
      ref={ref}
      action={formAction}
      className="flex shrink-0 items-center gap-2"
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
    >
      <Field />
      {state.error && (
        <p className="whitespace-nowrap text-xs text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
