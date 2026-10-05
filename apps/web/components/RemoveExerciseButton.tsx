"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "@/components/pulse/icons";

import { submitRemovePrescription } from "@/app/sessions/[id]/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ACTION_SHEET_EDITOR,
  ActionSheetItemText,
  actionSheetItemClass,
  useActionSheet,
} from "@/components/pulse/action-sheet";

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

const LAST_MOVEMENT_HINT = "A session must keep at least one exercise.";

// A per-prescription control to remove the prescribed Exercise from a standalone Session
// (Remove, ADR-0052) — Insert's symmetric partner. A hand-authored prescription's
// sets/reps/rest/tempo/Load are gone once removed, so the click is guarded by a two-step
// inline confirm (no modal); the confirm names the Superset-dissolve consequence when
// removing this movement would ungroup its partner. On confirm it posts to the remove
// server action and lets the revalidated Session page drop the movement and re-number the
// survivors in place. It lives in the card's action sheet (ADR-0113), and closes it on success:
// the card is keyed by position, so once the survivors re-number the same card shows the *next*
// movement, and a sheet left open would offer to remove one the reader never chose.
export function RemoveExerciseButton({
  sessionId,
  position,
  canRemove,
  dissolvesSuperset,
}: RemoveExerciseButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sheet = useActionSheet();

  if (!canRemove) {
    return (
      <button type="button" disabled className={actionSheetItemClass("danger")}>
        <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
        <ActionSheetItemText label="Remove" description={LAST_MOVEMENT_HINT} />
      </button>
    );
  }

  if (!confirming) {
    return (
      <div className="flex flex-col">
        <button
          type="button"
          className={actionSheetItemClass("danger")}
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
        >
          <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
          <ActionSheetItemText label="Remove" description="Take this movement out of the session" />
        </button>
        {error ? (
          <span role="alert" className="px-4 pb-2 font-mono text-[12px] text-magenta">
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
      // On success the revalidated page re-renders without this movement.
      sheet?.actions.close();
    });
  };

  return (
    <div className={cn(ACTION_SHEET_EDITOR, "flex flex-wrap items-center gap-3")}>
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
