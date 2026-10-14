"use client";

import { useActionState, useId, useRef, useState } from "react";
import { ChevronDown, RotateCcw, TrendingUp } from "@/components/pulse/icons";

import {
  submitChooseScheme,
  submitClearScheme,
  type SchemeFormState,
} from "@/app/sessions/[id]/actions";
import {
  DEFAULT_SCHEME,
  schemeLabel,
  type ProgressionScheme,
  type SchemeControlModel,
} from "@/lib/scheme-view";
import { schemePreview } from "@/lib/scheme-preview";
import { schemeNextStep } from "@/lib/scheme-next-step";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SchemeControlProps {
  sessionId: number;
  position: number;
  name: string;
  model: SchemeControlModel;
}

// The plan-view Progression Scheme control (ADR-0064, #432). Closed, it is one line under the
// card's set table — "PROGRESSION · Double Progression ▾" — because the table's NEXT row already
// says what the applied scheme does. Open, it lists only the schemes compatible with the
// movement's Load (`schemeControlModel`), each with what it changes next and its full Scheme
// Preview sentence, so a user compares schemes by what they do. **Apply** saves the chosen one in
// place; **Reset** returns a non-default choice to the default. Rendered on standalone Sessions
// only — a Protocol member's scheme is chosen on the Builder and committed via Deploy.
export function SchemeControl({ sessionId, position, name, model }: SchemeControlProps) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<ProgressionScheme>(model.current);
  const [state, action, pending] = useActionState<SchemeFormState, FormData>(
    submitChooseScheme,
    { error: null },
  );
  const panelId = useId();
  const unchanged = choice === model.current;

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-9 flex-wrap items-center justify-between gap-x-2 gap-y-1 text-left"
      >
        <span className="label-mono text-[9px] text-text-muted">Progression</span>
        <span className="flex items-center gap-1.5 font-mono text-[12px] text-text-primary">
          <TrendingUp className="h-3.5 w-3.5 shrink-0 text-cyan" aria-hidden />
          {schemeLabel(model.current)}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-text-muted transition-transform motion-reduce:transition-none",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </span>
      </button>

      {open ? (
        <div id={panelId} className="flex flex-col gap-2">
          <form action={action} className="flex flex-col gap-2">
            <input type="hidden" name="session_id" value={sessionId} />
            <input type="hidden" name="position" value={position} />
            <input type="hidden" name="scheme" value={choice} />
            <SchemeOptions
              label={`Progression scheme for ${name}`}
              model={model}
              choice={choice}
              onChoose={setChoice}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" disabled={pending || unchanged}>
                <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                {pending ? "Applying…" : "Apply"}
              </Button>
              {model.isOverridden ? null : (
                <span className="font-mono text-[11px] text-text-muted">
                  Default: {schemeLabel(DEFAULT_SCHEME)}
                </span>
              )}
            </div>
            {state.error ? (
              <span role="alert" className="font-mono text-[12px] text-magenta">
                {state.error}
              </span>
            ) : null}
          </form>
          {model.isOverridden ? <ResetSchemeForm sessionId={sessionId} position={position} /> : null}
        </div>
      ) : null}
    </div>
  );
}

interface SchemeOptionsProps {
  label: string;
  model: SchemeControlModel;
  choice: ProgressionScheme;
  onChoose: (scheme: ProgressionScheme) => void;
}

// A radio group of the compatible schemes. Hand-rolled from buttons so each option can carry its
// next step and sentence; it keeps the radio keyboard contract — one tab stop on the checked
// option, arrow keys move and select (WAI-ARIA radio group).
function SchemeOptions({ label, model, choice, onChoose }: SchemeOptionsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const step =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const nextIndex = (index + step + model.options.length) % model.options.length;
    onChoose(model.options[nextIndex].value);
    refs.current[nextIndex]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-1.5">
      {model.options.map((option, index) => {
        const checked = option.value === choice;
        const next = schemeNextStep(option.value, model.reps, model.load);
        return (
          <button
            key={option.value}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChoose(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "flex flex-col gap-1 rounded-sm border px-3 py-2.5 text-left transition-colors",
              checked ? "border-cyan bg-cyan-dim" : "border-border hover:border-border-lite",
            )}
          >
            <span className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span className="font-mono text-[12px] font-bold text-text-primary">
                {option.label}
              </span>
              <span
                className={cn(
                  "font-mono text-[11px]",
                  next.kind === "step" ? "text-cyan" : "text-text-muted",
                )}
              >
                {next.kind === "step" ? next.change : "Holds"}
              </span>
            </span>
            <span className="font-sans text-[12px] leading-snug text-text-secondary">
              {schemePreview(option.value, model.reps, model.load)}
            </span>
          </button>
        );
      })}
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
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
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
