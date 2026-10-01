"use client";

import { useActionState, useRef, useState } from "react";

import { deleteLogAction, type DeleteLogState } from "@/app/history/actions";
import { ConfirmDialog } from "@/components/pulse/confirm-dialog";

interface DeleteLogControlProps {
  logId: number;
  // Disabled client-side (a courtesy mirror of the server's contiguity gate, ADR-0034)
  // when deleting this record would leave a gap in the performed sequence. The `reason`
  // is a tail-first explanation shown on hover and inline.
  disabled: boolean;
  reason: string | null;
}

// A thin, destructive delete control for a Logged Session on the History screen. It is
// disabled when the correction would break contiguity; a confirm guards the click, and a
// server-side rejection (the authoritative gate) still surfaces its message inline.
//
// The confirm is the app's own `ConfirmDialog`, not `window.confirm` (#8): browser chrome
// ignores the Skin, and a reader who ticks "prevent additional dialogs" turns the guard into
// a standing answer — after which the control either stops working or stops guarding, with
// nothing on screen to say which. The button keeps `type="submit"` and only preventDefaults,
// so the form still posts the delete with JavaScript off exactly as it did before; the dialog
// is layered over that path rather than replacing it.
export function DeleteLogControl({ logId, disabled, reason }: DeleteLogControlProps) {
  const [state, action, pending] = useActionState<DeleteLogState, FormData>(
    deleteLogAction,
    { error: null },
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <form ref={formRef} action={action} className="inline-flex flex-wrap items-center gap-2">
        <input type="hidden" name="log_id" value={logId} />
        <button
          type="submit"
          disabled={disabled || pending}
          title={disabled ? reason ?? undefined : undefined}
          onClick={(event) => {
            event.preventDefault();
            setConfirming(true);
          }}
          className="label-mono inline-flex items-center rounded-md border border-border bg-elevated px-3 py-1.5 text-[10px] text-magenta transition-colors hover:border-magenta hover:bg-magenta-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-magenta/60 disabled:cursor-not-allowed disabled:opacity-50 disabled:text-text-muted disabled:hover:border-border disabled:hover:bg-elevated motion-reduce:transition-none"
        >
          {pending ? "Deleting…" : "Delete"}
        </button>
        {disabled && reason ? (
          <span className="w-full font-mono text-[9px] leading-tight text-text-muted">
            {reason}
          </span>
        ) : null}
        {state.error ? (
          <span role="alert" className="w-full font-mono text-[9px] leading-tight text-magenta">
            {state.error}
          </span>
        ) : null}
      </form>
      {confirming ? (
        <ConfirmDialog
          title="Delete this logged session?"
          message="This can’t be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            // Submit the form rather than calling the action with a hand-built payload, so
            // the confirmed delete travels the same path as the unguarded one and the hidden
            // `log_id` stays the single place the record is named. `requestSubmit` submits
            // the form itself, not the button, so the guarded click cannot re-enter here.
            formRef.current?.requestSubmit();
          }}
        />
      ) : null}
    </>
  );
}
