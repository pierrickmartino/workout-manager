"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

import { submitRemovePrescription } from "@/app/sessions/[id]/actions";
import { Button } from "@/components/ui/button";

interface RemoveExerciseButtonProps {
  sessionId: number;
  position: number;
  // Whether this prescription may be removed at all. `false` on the last remaining
  // movement — a Session must keep at least one (ADR-0052, Q4) — so the control is shown
  // disabled with a hint rather than firing a doomed request; the server 422 is the backstop.
  canRemove: boolean;
  // Whether removing this prescription dissolves a Superset partner: `true` when it is one
  // of exactly two members of a Superset, so the confirm names the consequence — the lone
  // survivor becomes a solo exercise (ADR-0052, Q5/Q9).
  dissolvesSuperset: boolean;
}

const LAST_MOVEMENT_HINT = "A session must keep at least one movement.";

// A per-prescription control to remove the prescribed Exercise from a standalone Session
// (Remove, ADR-0052) — Insert's symmetric partner. A hand-authored prescription's
// sets/reps/rest/tempo/Load are gone once removed, so the click is guarded by a two-step
// inline confirm (no modal); the confirm names the Superset-dissolve consequence when
// removing this movement would ungroup its partner. On confirm it posts to the remove
// server action and lets the revalidated Session page drop the movement and re-number the
// survivors in place.
export function RemoveExerciseButton({
  sessionId,
  position,
  canRemove,
  dissolvesSuperset,
}: RemoveExerciseButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canRemove) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled
        title={LAST_MOVEMENT_HINT}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Remove
      </Button>
    );
  }

  if (!confirming) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remove
        </Button>
        {error ? (
          <span role="alert" className="font-mono text-[12px] text-magenta">
            {error}
          </span>
        ) : null}
      </div>
    );
  }

  const confirmPrompt = dissolvesSuperset
    ? "Remove this exercise? Its superset partner will become a solo exercise."
    : "Remove this exercise?";

  const remove = () => {
    setError(null);
    startTransition(async () => {
      const outcome = await submitRemovePrescription(sessionId, position);
      if (outcome.error) {
        setError(outcome.error);
        setConfirming(false);
        return;
      }
      // On success the revalidated page re-renders without this row; nothing else to do.
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="font-mono text-[12px] text-text-secondary">
        {confirmPrompt}
      </span>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={remove}
        disabled={pending}
      >
        <Trash2 className="h-3.5 w-3.5" />
        {pending ? "Removing…" : "Remove"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setConfirming(false)}
        disabled={pending}
      >
        Cancel
      </Button>
    </div>
  );
}
