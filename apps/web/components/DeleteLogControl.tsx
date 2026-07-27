"use client";

import { useActionState } from "react";

import { deleteLogAction, type DeleteLogState } from "@/app/history/actions";

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
export function DeleteLogControl({ logId, disabled, reason }: DeleteLogControlProps) {
  const [state, action, pending] = useActionState<DeleteLogState, FormData>(
    deleteLogAction,
    { error: null },
  );

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="log_id" value={logId} />
      <button
        type="submit"
        disabled={disabled || pending}
        title={disabled ? reason ?? undefined : undefined}
        onClick={(event) => {
          if (!window.confirm("Delete this logged session? This can't be undone.")) {
            event.preventDefault();
          }
        }}
        className="label-mono text-[10px] text-magenta transition-opacity hover:underline disabled:cursor-not-allowed disabled:text-text-muted disabled:no-underline"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {disabled && reason ? (
        <span className="max-w-[16rem] text-right font-mono text-[9px] leading-tight text-text-muted">
          {reason}
        </span>
      ) : null}
      {state.error ? (
        <span className="max-w-[16rem] text-right font-mono text-[9px] leading-tight text-magenta">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
