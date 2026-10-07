"use client";

import { useId, useState, useTransition } from "react";
import { Loader2, Minus, Plus, RotateCcw } from "@/components/pulse/icons";

import { calibrateCurrentProtocol } from "@/app/dashboard/calibration-actions";
import {
  CALIBRATION_EFFECT,
  SENSITIVE_CAVEAT,
  calibrationControlView,
} from "@/lib/calibration-control";
import type { ProtocolProgress } from "@/lib/protocols-types";
import { Alert } from "@/components/pulse/alert";
import { cn } from "@/lib/utils";

interface CalibrationControlProps {
  // The Current Protocol, read server-side. Its `calibration` and the clamp's bounds come
  // straight off the payload (ADR-0111), so this component asserts nothing about ±3.
  protocol: ProtocolProgress;
}

// The Home control for a Protocol's **Calibration** (CONTEXT "Calibration", ADR-0111): a
// stepper whose two ends — easier, harder — re-pitch the whole un-performed tail relative to
// what the plan already says, with the standing offset read out between them, so the result of
// a tap lands where the eye already is. The offset posted is *absolute*, so a double-tap is
// idempotent rather than two steps.
//
// The whole presentation comes from the pure `calibrationControlView` mapper, so this stays
// thin. Deliberately **silent about the plan**: under a materialised re-pitch the effect is
// self-evidencing — the loads, sets and rest on screen change — so there is no per-exercise
// badge and the Prescription Summary is untouched. The one exception is the **rail**, where an
// inert control that never explains itself would be a defect; the note there points at the
// Fitness Level, which is what actually fixes a persistently mis-pitched plan.
//
// A user with a Sensitive Constraint re-pitches in **both** directions and sees a caveat, not
// a refusal (ADR-0058's precedent) — the server decides that and reports it back.
export function CalibrationControl({
  protocol,
}: CalibrationControlProps): React.JSX.Element {
  const labelId = useId();
  const [error, setError] = useState<string | null>(null);
  const [caveat, setCaveat] = useState<boolean>(false);
  // Which target is in flight, so the spinner sits on the end that was tapped.
  const [posting, setPosting] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const view = calibrationControlView(protocol);
  const spinsFor = (target: number | null): boolean =>
    isPending && target !== null && posting === target;

  function calibrate(target: number | null): void {
    if (target === null) {
      return;
    }
    setError(null);
    setPosting(target);
    startTransition(async () => {
      const result = await calibrateCurrentProtocol(protocol.id, target);
      if (result.error) {
        setError(result.error);
        return;
      }
      setCaveat(result.sensitiveCaveat);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span id={labelId} className="label-mono text-[10px] text-text-secondary">
          PITCH // REMAINING SESSIONS
        </span>
        {/* Out of the stepper and out of the way: a return to the authored plan is the rare
            act. `invisible` at the written plan rather than unmounted, so the label row does
            not shift on the first tap; it is out of the tab order and the a11y tree there. */}
        <button
          type="button"
          aria-label="Return remaining sessions to the written plan"
          disabled={!view.reset.enabled || isPending}
          onClick={() => calibrate(view.reset.target)}
          className={cn(
            "-my-1.5 flex items-center gap-1.5 py-1.5 text-xs font-medium text-cyan underline-offset-4 hover:underline disabled:opacity-50",
            !view.reset.enabled && "invisible",
          )}
        >
          {spinsFor(view.reset.target) ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          )}
          Back to plan
        </button>
      </div>

      {/* One row of three where the card is at least 17rem wide; below that — a 320px phone, or
          any phone at 200% text, since a `rem` threshold scales with the text (ADR-0087) — the
          readout takes the first row and the ends wrap beneath it. The dividers are the 1px gap
          showing the group's own fill, so they follow the cells wherever they wrap. */}
      <div className="@container">
        <div
          role="group"
          aria-labelledby={labelId}
          className="flex flex-wrap gap-px overflow-hidden rounded-sm border border-border-lite bg-border-lite"
        >
          <StepperEnd
            label="Make remaining sessions easier"
            short="Easier"
            icon={Minus}
            enabled={view.easier.enabled && !isPending}
            spinning={spinsFor(view.easier.target)}
            onClick={() => calibrate(view.easier.target)}
          />
          <div
            aria-live="polite"
            className="order-first flex min-w-0 basis-full flex-col items-center justify-center gap-1 bg-base px-2 py-3 text-center @min-[17rem]:order-none @min-[17rem]:basis-0 @min-[17rem]:grow"
          >
            <span className="min-w-0 break-words font-display text-xl font-semibold text-text-primary">
              {view.readout.headline}
            </span>
            <span className="label-mono min-w-0 break-words text-[10px] text-text-muted">
              {view.readout.direction}
            </span>
          </div>
          <StepperEnd
            label="Make remaining sessions harder"
            short="Harder"
            icon={Plus}
            enabled={view.harder.enabled && !isPending}
            spinning={spinsFor(view.harder.target)}
            onClick={() => calibrate(view.harder.target)}
          />
        </div>
      </div>

      <p className="text-xs leading-relaxed text-text-muted">{CALIBRATION_EFFECT}</p>

      {view.railNote ? (
        <Alert tone="info" announce>
          {view.railNote}
        </Alert>
      ) : null}

      {caveat ? (
        <Alert tone="info" announce>
          {SENSITIVE_CAVEAT}
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="error" announce>
          {error}
        </Alert>
      ) : null}
    </div>
  );
}

interface StepperEndProps {
  // The full accessible name. The visible text is a single word, so the button needs its own
  // label to say *what* it re-pitches — "Easier" alone names no object.
  label: string;
  short: string;
  icon: React.ElementType;
  enabled: boolean;
  spinning: boolean;
  onClick: () => void;
}

// One end of the stepper. A native `<button>`, so `globals.css`'s tap-target rule gives it
// `touch-action: manipulation` and the first tap answers (ADR-0099). It grows to share a
// wrapped row with the other end, and holds its own width beside the readout.
function StepperEnd({
  label,
  short,
  icon: Icon,
  enabled,
  spinning,
  onClick,
}: StepperEndProps): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={!enabled}
      onClick={onClick}
      className="flex min-w-0 grow flex-col items-center justify-center gap-1 bg-surface px-4 py-3 text-text-secondary transition-colors hover:bg-elevated hover:text-text-primary disabled:text-text-muted disabled:opacity-50 motion-reduce:transition-none @min-[17rem]:grow-0"
    >
      {spinning ? (
        <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden />
      ) : (
        <Icon className="h-5 w-5" aria-hidden />
      )}
      <span className="label-mono text-[10px]">{short}</span>
    </button>
  );
}
