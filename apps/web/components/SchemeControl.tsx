"use client";

import { useActionState, useState } from "react";
import { TrendingUp, RotateCcw } from "lucide-react";

import {
  submitChooseScheme,
  submitClearScheme,
  type SchemeFormState,
} from "@/app/sessions/[id]/actions";
import {
  DEFAULT_SCHEME,
  schemeLabel,
  type SchemeControlModel,
} from "@/lib/scheme-view";
import { Button } from "@/components/ui/button";

interface SchemeControlProps {
  sessionId: number;
  position: number;
  model: SchemeControlModel;
}

// The plan-view Progression Scheme control (ADR-0064, #432). The pure `schemeControlModel`
// (lib/scheme-view) decides the current scheme and the compatible alternatives, so this
// component stays a thin renderer: a native select offering only compatible schemes (a user
// can never pick one the write path would reject), an **Apply** action that saves the chosen
// scheme in place, and a **Reset to default** action shown only when a non-default scheme is
// active. Rendered on standalone Sessions only — a Protocol member's scheme is chosen on the
// Builder and committed via Deploy, so the page withholds this there.
export function SchemeControl({ sessionId, position, model }: SchemeControlProps) {
  const [choice, setChoice] = useState<string>(model.current);
  const [state, action, pending] = useActionState<SchemeFormState, FormData>(
    submitChooseScheme,
    { error: null },
  );

  const unchanged = choice === model.current;
  const selectId = `scheme-${sessionId}-${position}`;

  return (
    <div className="flex flex-col gap-1.5">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="session_id" value={sessionId} />
        <input type="hidden" name="position" value={position} />
        <label className="flex flex-col gap-1" htmlFor={selectId}>
          <span className="label-mono text-[9px] text-text-muted">
            Progression scheme
          </span>
          <select
            id={selectId}
            name="scheme"
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
            aria-label="Progression scheme"
            className="h-9 rounded-sm border border-border bg-surface px-2 font-mono text-[13px] text-text-primary"
          >
            {model.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline" size="sm" disabled={pending || unchanged}>
          <TrendingUp className="h-3.5 w-3.5" />
          {pending ? "Applying…" : "Apply scheme"}
        </Button>
      </form>
      {model.isOverridden ? (
        <ResetSchemeForm sessionId={sessionId} position={position} />
      ) : (
        <span className="font-mono text-[11px] text-text-muted">
          Default: {schemeLabel(DEFAULT_SCHEME)}
        </span>
      )}
      {state.error ? (
        <span role="alert" className="font-mono text-[12px] text-magenta">
          {state.error}
        </span>
      ) : null}
    </div>
  );
}

function ResetSchemeForm({
  sessionId,
  position,
}: {
  sessionId: number;
  position: number;
}) {
  const [state, action, pending] = useActionState<SchemeFormState, FormData>(
    submitClearScheme,
    { error: null },
  );
  return (
    <div className="flex flex-col gap-1">
      <form action={action}>
        <input type="hidden" name="session_id" value={sessionId} />
        <input type="hidden" name="position" value={position} />
        <Button type="submit" variant="ghost" size="sm" disabled={pending}>
          <RotateCcw className="h-3.5 w-3.5" />
          {pending ? "Resetting…" : `Reset to ${schemeLabel(DEFAULT_SCHEME)}`}
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
