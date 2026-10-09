"use client";

import { useActionState } from "react";

import {
  switchProtocolAction,
  type SwitchProtocolState,
} from "@/app/protocols/actions";
import type { SwitchAction } from "@/lib/protocols-index";
import { buttonVariants } from "@/components/ui/button";
import { BlockedRowAction } from "@/components/BlockedRowAction";

interface SwitchProtocolControlProps {
  action: SwitchAction;
  // The row's title, so every Switch button on the page has a distinct accessible name.
  protocolTitle: string;
}

// The Switch control on a set-aside row (issue #638). No confirmation: Switch is reversible,
// and the server action lands the user on Home showing the new Current Protocol. The
// view-model decides whether it is offered, pending or blocked; this only renders that verdict.
//
// Blocked (a Live Session is in progress) renders `BlockedRowAction`: focusable, announced as
// unavailable with its reason, and a way back to the Live Session. Pending (the slot is not
// read yet) is a plain disabled button for the moment before hydration, so Switch can never be
// pressed before a Live Session has been ruled out.
export function SwitchProtocolControl({
  action,
  protocolTitle,
}: SwitchProtocolControlProps): React.JSX.Element {
  const [state, formAction, pending] = useActionState<SwitchProtocolState, FormData>(
    switchProtocolAction,
    { error: null },
  );
  const label = `Switch to ${protocolTitle}`;
  const buttonClass = buttonVariants({ variant: "secondary", size: "sm" });

  if (action.kind === "pending") {
    return (
      <button type="button" disabled aria-label={label} className={buttonClass}>
        Switch
      </button>
    );
  }

  if (action.kind === "blocked") {
    return (
      <BlockedRowAction
        label={label}
        blocked={action}
        className={buttonClass}
      >
        Switch
      </BlockedRowAction>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <input type="hidden" name="protocol_id" value={action.protocolId} />
      <button type="submit" disabled={pending} aria-label={label} className={buttonClass}>
        {pending ? "Switching…" : "Switch"}
      </button>
      {state.error ? (
        <p role="alert" className="font-mono text-[12px] leading-relaxed text-magenta">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
