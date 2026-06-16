"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createFolderAction } from "@/lib/actions/library";
import type { ActionResult } from "@/lib/actions/types";
import { he } from "@/lib/strings";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending} className="w-full gap-1.5">
      <FolderPlus className="h-4 w-4" />
      {pending ? he.library.creating : he.library.newFolder}
    </Button>
  );
}

export default function NewFolderForm() {
  const [state, formAction] = useFormState<ActionResult, FormData>(createFolderAction, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-2">
      <Input
        name="name"
        placeholder={he.library.folderNamePlaceholder}
        required
        className="text-sm"
      />
      <SubmitButton />
      {state.error && (
        <p className="text-xs text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
