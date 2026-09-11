"use client";

import { useActionState } from "react";
import { Copy } from "lucide-react";

import {
  submitDuplicate,
  type DuplicateFormState,
} from "@/app/sessions/[id]/actions";
import { Button } from "@/components/ui/button";

interface DuplicateButtonProps {
  sessionId: number;
}

// Duplicate this Session into a new standalone plan (ADR-0043). Posts to the duplicate
// server action, which redirects to the new copy on success. Duplicate is unlimited, so
// there is no spent state; a failed attempt shows an inline error.
export function DuplicateButton({ sessionId }: DuplicateButtonProps) {
  const [state, action, pending] = useActionState<DuplicateFormState, FormData>(
    submitDuplicate,
    { error: null },
  );

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="session_id" value={sessionId} />
      <Button
        type="submit"
        variant="secondary"
        className="w-full"
        disabled={pending}
      >
        <Copy className="h-4 w-4" />
        {pending ? "Duplicating…" : "Duplicate session"}
      </Button>
      {state.error ? (
        <span role="alert" className="font-mono text-[12px] text-magenta">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
