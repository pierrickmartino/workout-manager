"use client";

import { useActionState } from "react";
import { RotateCcw } from "@/components/pulse/icons";

import {
  submitRestore,
  type SubstituteFormState,
} from "@/app/sessions/[id]/actions";
import type { RestoreOriginalView } from "@/lib/restore-original-view";
import { Button } from "@/components/ui/button";

interface RestoreOriginalButtonProps {
  sessionId: number;
  position: number;
  view: RestoreOriginalView;
}

// "Restore original" on a substituted prescription (ADR-0143, #788): puts the Prescribed
// Original's Exercise, Load and Progression Scheme back exactly. Not destructive — the
// substitute can be swapped in again — so no confirm. The revalidated Session page re-renders
// the original movement in place.
export function RestoreOriginalButton({ sessionId, position, view }: RestoreOriginalButtonProps) {
  const [state, action, pending] = useActionState<SubstituteFormState, FormData>(
    submitRestore,
    { error: null },
  );

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="position" value={position} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        <RotateCcw className="h-3.5 w-3.5" />
        {pending ? "Restoring…" : view.label}
      </Button>
      <span className="font-mono text-[12px] text-text-muted">{view.description}</span>
      {state.error ? (
        <span role="alert" className="font-mono text-[12px] text-magenta">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
