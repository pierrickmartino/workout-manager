"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "@/components/pulse/icons";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ACTION_SHEET_EDITOR,
  ActionSheetItemText,
  actionSheetItemClass,
} from "@/components/pulse/action-sheet-item";

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
  // When set, the control is shown **disabled** with this hint — the Session has logged training
  // and can't be deleted (the detail page passes it then; the server 409 is the backstop). `null`
  // renders the interactive two-step confirm. The My Sessions row is rendered only when deletable,
  // so it never passes a hint.
  disabledHint?: string | null;
}

// The Session Delete control (CONTEXT: Delete, ADR-0063), the last row of the action sheet on both
// the Session detail and each My Sessions row (ADR-0113). A hard delete is irreversible, so the
// click is guarded by a two-step confirm that opens in place of the row, the same idiom as
// RemoveExerciseButton. On the detail a performed Session shows this disabled, with the reason as
// the row's description; the on-success behaviour (redirect vs. revalidate) lives entirely in the
// injected `action`, so this stays a thin renderer — and either one unmounts the sheet with it.
export function DeleteSessionControl({
  sessionId,
  action,
  disabledHint = null,
}: DeleteSessionControlProps) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState<
    DeleteActionState,
    FormData
  >(action, { error: null });

  if (disabledHint) {
    return (
      <button type="button" disabled className={actionSheetItemClass("danger")}>
        <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
        <ActionSheetItemText label="Delete" description={disabledHint} />
      </button>
    );
  }

  if (!confirming) {
    return (
      <div className="flex flex-col">
        <button
          type="button"
          aria-label="Delete session"
          className={actionSheetItemClass("danger")}
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
          <ActionSheetItemText label="Delete" description="Permanently remove this session" />
        </button>
        {state.error ? (
          <span role="alert" className="px-4 pb-2 font-mono text-[12px] text-magenta">
            {state.error}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <form action={formAction} className={cn(ACTION_SHEET_EDITOR, "flex flex-wrap items-center gap-3")}>
      <input type="hidden" name="session_id" value={sessionId} />
      <span className="font-mono text-[12px] text-text-secondary">
        Delete this session?
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
