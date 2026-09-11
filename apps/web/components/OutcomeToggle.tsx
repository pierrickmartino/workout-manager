"use client";

import { useActionState } from "react";

import {
  toggleOutcomeAction,
  type ToggleOutcomeState,
} from "@/app/history/actions";
import type { CompletionOutcome } from "@/lib/logs-types";

interface OutcomeToggleProps {
  logId: number;
  // The record's current Completion Outcome (ADR-0013); `null` is an undeclared outcome,
  // which still advances the Protocol — so it toggles like Completed.
  outcome: CompletionOutcome | null;
  // Disabled client-side (a courtesy mirror of the server's contiguity gate, ADR-0034)
  // when un-completing this record would leave a gap in the performed sequence. The
  // `reason` is a tail-first explanation shown on hover and inline. Only ever set for the
  // un-complete direction — marking Completed only fills the set and is never gated.
  uncompleteDisabled: boolean;
  uncompleteReason: string | null;
}

// A thin control to correct a plan-backed Logged Session's Completion Outcome from the
// History screen. A record that currently advances (Completed or undeclared) offers "Mark
// incomplete" — disabled when the flip would break contiguity; an Incomplete record offers
// "Mark completed", which is never gated. The server (the authoritative gate) still
// surfaces a `409` message inline.
export function OutcomeToggle({
  logId,
  outcome,
  uncompleteDisabled,
  uncompleteReason,
}: OutcomeToggleProps) {
  const [state, action, pending] = useActionState<ToggleOutcomeState, FormData>(
    toggleOutcomeAction,
    { error: null },
  );

  const isIncomplete = outcome === "incomplete";
  // The advancing side flips to Incomplete (gated); the Incomplete side flips to Completed.
  const target: CompletionOutcome = isIncomplete ? "completed" : "incomplete";
  const label = isIncomplete ? "Mark completed" : "Mark incomplete";
  const disabled = (uncompleteDisabled && !isIncomplete) || pending;

  return (
    <form action={action} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name="log_id" value={logId} />
      <input type="hidden" name="outcome" value={target} />
      {/* The current outcome as a small status indicator (dot + label), not a button. */}
      <span className="label-mono inline-flex items-center gap-1.5 text-[10px] text-text-muted">
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${isIncomplete ? "bg-text-muted" : "bg-cyan"}`}
        />
        {isIncomplete ? "INCOMPLETE" : "COMPLETED"}
      </span>
      <button
        type="submit"
        disabled={disabled}
        title={
          disabled && !pending ? (uncompleteReason ?? undefined) : undefined
        }
        className="label-mono inline-flex items-center rounded-md border border-border bg-elevated px-3 py-1.5 text-[10px] text-text-primary transition-colors hover:border-cyan hover:text-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:text-text-primary motion-reduce:transition-none"
      >
        {pending ? "Saving…" : label}
      </button>
      {uncompleteDisabled && !isIncomplete && uncompleteReason ? (
        <span className="w-full font-mono text-[9px] leading-tight text-text-muted">
          {uncompleteReason}
        </span>
      ) : null}
      {state.error ? (
        <span className="w-full font-mono text-[9px] leading-tight text-magenta">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
