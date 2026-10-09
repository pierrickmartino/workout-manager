"use client";

import { useActionState, useRef, useState } from "react";

import {
  deleteProtocolAction,
  type DeleteProtocolState,
} from "@/app/protocols/actions";
import type { DeleteAction } from "@/lib/protocols-index";
import { buttonVariants } from "@/components/ui/button";
import { BlockedRowAction } from "@/components/BlockedRowAction";
import { ConfirmDialog } from "@/components/pulse/confirm-dialog";

interface DeleteProtocolControlProps {
  action: DeleteAction;
  // The row's title, so every Delete button has a distinct accessible name and the
  // confirmation names what it removes.
  protocolTitle: string;
}

// The Delete control on an un-started Protocol's row (issue #639). The view-model decides
// whether it is offered, pending or blocked; this only renders that verdict.
//
// Deleting can't be undone, so it is guarded by the app's own `ConfirmDialog` (ADR-0098), never
// `window.confirm`. As on the logged-session delete, the button keeps `type="submit"` and only
// preventDefaults, and confirming calls `requestSubmit()`, so the confirmed delete travels the
// same form path and the hidden `protocol_id` stays the one place the Protocol is named. A server
// refusal (a Session logged since the index was drawn) is announced through `role="alert"`.
export function DeleteProtocolControl({
  action,
  protocolTitle,
}: DeleteProtocolControlProps): React.JSX.Element {
  const [state, formAction, pending] = useActionState<DeleteProtocolState, FormData>(
    deleteProtocolAction,
    { error: null },
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [confirming, setConfirming] = useState(false);
  const label = `Delete ${protocolTitle}`;
  const buttonClass = `${buttonVariants({ variant: "secondary", size: "sm" })} text-magenta hover:border-magenta`;

  if (action.kind === "pending") {
    return (
      <button type="button" disabled aria-label={label} className={buttonClass}>
        Delete
      </button>
    );
  }

  if (action.kind === "blocked") {
    return (
      <BlockedRowAction
        label={label}
        reason={action.reason}
        resumeHref={action.resumeHref}
        className={buttonVariants({ variant: "secondary", size: "sm" })}
      >
        Delete
      </BlockedRowAction>
    );
  }

  return (
    <>
      <form ref={formRef} action={formAction} className="flex flex-col items-start gap-2">
        <input type="hidden" name="protocol_id" value={action.protocolId} />
        <button
          type="submit"
          disabled={pending}
          aria-label={label}
          onClick={(event) => {
            event.preventDefault();
            setConfirming(true);
          }}
          className={buttonClass}
        >
          {pending ? "Deleting…" : "Delete"}
        </button>
        {state.error ? (
          <p role="alert" className="font-mono text-[12px] leading-relaxed text-magenta">
            {state.error}
          </p>
        ) : null}
      </form>
      {confirming ? (
        <ConfirmDialog
          title={`Delete “${protocolTitle}”?`}
          message="You haven’t trained it yet, so no history is lost, but the plan itself can’t be brought back."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            // `requestSubmit` submits the form itself, not the button, so the guarded click
            // cannot re-enter here.
            formRef.current?.requestSubmit();
          }}
        />
      ) : null}
    </>
  );
}
