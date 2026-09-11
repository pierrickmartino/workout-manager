"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

// The `{ error }` state both Delete server actions resolve to (Delete, ADR-0063). Named here so
// this control can drive either the detail-page action (which redirects on success) or the
// library-row action (which revalidates) through one `useActionState`.
export interface DeleteActionState {
  error: string | null;
}

type DeleteAction = (
  state: DeleteActionState,
  form: FormData,
) => Promise<DeleteActionState>;

interface DeleteSessionControlProps {
  sessionId: number;
  // The Delete server action to submit — `submitDeleteSession` (detail, redirects) or
  // `submitDeleteSessionRow` (library, revalidates). Passed in so this one control serves both.
  action: DeleteAction;
  // The prompt shown in the two-step confirm: the fuller "Delete this session?" on the detail
  // page, the compact "Delete?" on a My Sessions row.
  confirmPrompt?: string;
  // When set, the control is shown **disabled** with this hint — the Session has logged training
  // and can't be deleted (the detail page passes it then; the server 409 is the backstop). `null`
  // renders the interactive two-step confirm. The My Sessions row is rendered only when deletable,
  // so it never passes a hint.
  disabledHint?: string | null;
}

// The Session Delete control (CONTEXT: Delete, ADR-0063), shared by the Session detail (beside
// Rename/Favorite/Share) and each My Sessions row. A hard delete is irreversible, so the click is
// guarded by a two-step inline confirm (no modal), the same idiom as RemoveExerciseButton. On the
// detail a performed Session shows this disabled with `disabledHint`; the on-success behaviour
// (redirect vs. revalidate) lives entirely in the injected `action`, so this stays a thin renderer.
export function DeleteSessionControl({
  sessionId,
  action,
  confirmPrompt = "Delete this session?",
  disabledHint = null,
}: DeleteSessionControlProps) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState<
    DeleteActionState,
    FormData
  >(action, { error: null });

  if (disabledHint) {
    return (
      <Button type="button" variant="ghost" size="sm" disabled title={disabledHint}>
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>
    );
  }

  if (!confirming) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Delete session"
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
        {state.error ? (
          <span role="alert" className="font-mono text-[12px] text-magenta">
            {state.error}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="session_id" value={sessionId} />
      <span className="font-mono text-[12px] text-text-secondary">
        {confirmPrompt}
      </span>
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        <Trash2 className="h-3.5 w-3.5" />
        {pending ? "Deleting…" : "Delete"}
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
      {state.error ? (
        <span role="alert" className="font-mono text-[12px] text-magenta">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
