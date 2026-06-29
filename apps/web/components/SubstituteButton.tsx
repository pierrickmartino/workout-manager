"use client";

import { useActionState } from "react";

import {
  submitSubstitute,
  type SubstituteFormState,
} from "@/app/sessions/[id]/actions";

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
    <form action={action} style={{ marginTop: "0.5rem" }}>
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="position" value={position} />
      <button type="submit" disabled={pending}>
        {pending ? "Finding a substitute…" : "Substitute"}
      </button>
      {state.error ? (
        <span role="alert" style={{ marginLeft: "0.5rem", color: "#b91c1c" }}>
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
