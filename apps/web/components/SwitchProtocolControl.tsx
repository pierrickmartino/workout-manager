"use client";

import Link from "next/link";
import { useActionState, useId } from "react";

import {
  switchProtocolAction,
  type SwitchProtocolState,
} from "@/app/protocols/actions";
import type { SwitchAction } from "@/lib/protocols-index";
import { NAV_FORWARD } from "@/lib/nav-direction";
import { buttonVariants } from "@/components/ui/button";

interface SwitchProtocolControlProps {
  action: SwitchAction;
  // The row's title, so every Switch button on the page has a distinct accessible name.
  protocolTitle: string;
}

// The Switch control on a set-aside row (issue #638). No confirmation: Switch is reversible,
// and the server action lands the user on Home showing the new Current Protocol. The
// view-model decides whether it is offered, pending or blocked; this only renders that verdict.
//
// Blocked (a Live Session is in progress) is an `aria-disabled` button rather than a
// `disabled` one, so it stays focusable and a screen reader announces it as unavailable with
// the reason attached through `aria-describedby`. The reason is also visible, with a way back
// to the Live Session beside it rather than inside the description. Pending (the slot is not
// read yet) is a plain disabled button for the moment before hydration, so Switch can never be
// pressed before a Live Session has been ruled out.
export function SwitchProtocolControl({
  action,
  protocolTitle,
}: SwitchProtocolControlProps): React.JSX.Element {
  const reasonId = useId();
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
      <div className="flex flex-col items-start gap-2">
        <button
          type="button"
          aria-disabled="true"
          aria-label={label}
          aria-describedby={reasonId}
          className={`${buttonClass} cursor-not-allowed text-text-muted hover:bg-surface`}
        >
          Switch
        </button>
        <p id={reasonId} className="font-mono text-[12px] leading-relaxed text-text-secondary">
          {action.reason}
        </p>
        <Link
          {...NAV_FORWARD}
          href={action.resumeHref}
          className="font-mono text-[12px] text-cyan hover:underline"
        >
          Resume session
        </Link>
      </div>
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
