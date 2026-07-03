"use client";

import { useActionState } from "react";
import { Repeat2 } from "lucide-react";

import {
  submitSubstitute,
  type SubstituteFormState,
} from "@/app/sessions/[id]/actions";
import { Button } from "@/components/ui/button";

interface SubstituteButtonProps {
  sessionId: number;
  position: number;
}

// A per-prescription control to substitute the prescribed Exercise. Posts to the
// substitution server action and lets the revalidated Session page re-render the
// swapped-in movement. Substitution is unlimited, so there is no spent state.
export function SubstituteButton({ sessionId, position }: SubstituteButtonProps) {
  const [state, action, pending] = useActionState<SubstituteFormState, FormData>(
    submitSubstitute,
    { error: null },
  );

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="position" value={position} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        <Repeat2 className="h-3.5 w-3.5" />
        {pending ? "Finding a substitute…" : "Substitute"}
      </Button>
      {state.error ? (
        <span role="alert" className="font-mono text-[12px] text-magenta">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
