"use client";

import { useActionState, useState } from "react";
import { Pin, PinOff } from "lucide-react";

import { submitPin, submitUnpin, type PinFormState } from "@/app/sessions/[id]/actions";
import { normalizePinTarget } from "@/lib/log-session-form";
import type { PinControlModel } from "@/lib/pin-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PinControlProps {
  sessionId: number;
  position: number;
  model: PinControlModel;
  // Pre-fill + auto-open, carried from the log-flow Pin offer (`/sessions/{id}?pin=…&reps=…`):
  // when the user confirmed the offer, the plan opens this movement's Pin editor pre-filled with
  // the proposed range so the common case needs no typing (ADR-0053, user stories 5/6).
  initialReps?: string;
  autoOpen?: boolean;
}

// The plan-view Pin control (ADR-0053, #371). Its shape is decided by the pure `pinControlModel`
// (lib/pin-view), so this component stays a thin renderer:
//   * `pinned`   — surface an **un-pin** control that hands the movement back to automatic
//                  Progression (the pinned range itself is shown in the card's data list);
//   * `pinnable` — a **Pin** control that opens an inline editor pre-filled with an editable range
//                  and saves it through the pin route; and
//   * `none`     — render nothing (reps are not this movement's pinnable axis).
// The edit is gated client-side by the same `normalizePinTarget` rule the server enforces, so the
// Save button never fires a request the backend would reject as an invalid range.
export function PinControl({
  sessionId,
  position,
  model,
  initialReps,
  autoOpen = false,
}: PinControlProps) {
  if (model.kind === "none") return null;
  if (model.kind === "pinned") {
    return <UnpinForm sessionId={sessionId} position={position} />;
  }
  return (
    <PinForm
      sessionId={sessionId}
      position={position}
      initialReps={initialReps ?? model.defaultReps}
      autoOpen={autoOpen}
    />
  );
}

function UnpinForm({
  sessionId,
  position,
}: {
  sessionId: number;
  position: number;
}) {
  const [state, action, pending] = useActionState<PinFormState, FormData>(
    submitUnpin,
    { error: null },
  );
  return (
    <div className="flex flex-col gap-1.5">
      <form action={action}>
        <input type="hidden" name="session_id" value={sessionId} />
        <input type="hidden" name="position" value={position} />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          <PinOff className="h-3.5 w-3.5" />
          {pending ? "Un-pinning…" : "Un-pin (resume progression)"}
        </Button>
      </form>
      {state.error ? (
        <span role="alert" className="font-mono text-[12px] text-magenta">
          {state.error}
        </span>
      ) : null}
    </div>
  );
}

function PinForm({
  sessionId,
  position,
  initialReps,
  autoOpen,
}: {
  sessionId: number;
  position: number;
  initialReps: string;
  autoOpen: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);
  const [reps, setReps] = useState(initialReps);
  const [state, action, pending] = useActionState<PinFormState, FormData>(
    submitPin,
    { error: null },
  );

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Pin className="h-3.5 w-3.5" />
        Pin rep target
      </Button>
    );
  }

  const invalid = normalizePinTarget(reps) === null;
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="position" value={position} />
      <label className="flex flex-col gap-1.5">
        <span className="label-mono text-[9px] text-text-muted">
          Pinned rep target
        </span>
        <Input
          name="reps"
          value={reps}
          onChange={(event) => setReps(event.target.value)}
          placeholder="10-14"
          aria-label="Pinned rep target"
          aria-invalid={invalid}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending || invalid}>
          <Pin className="h-3.5 w-3.5" />
          {pending ? "Pinning…" : "Save pinned target"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
      {state.error ? (
        <span role="alert" className="font-mono text-[12px] text-magenta">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
