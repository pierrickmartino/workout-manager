"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Loader2, RotateCcw } from "@/components/pulse/icons";

import { calibrateCurrentProtocol } from "@/app/dashboard/calibration-actions";
import {
  SENSITIVE_CAVEAT,
  calibrationControlView,
} from "@/lib/calibration-control";
import type { ProtocolProgress } from "@/lib/protocols-types";
import { Alert } from "@/components/pulse/alert";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CalibrationControlProps {
  // The Current Protocol, read server-side. Its `calibration` and the clamp's bounds come
  // straight off the payload (ADR-0111), so this component asserts nothing about ±3.
  protocol: ProtocolProgress;
}

// The Home control for a Protocol's **Calibration** (CONTEXT "Calibration", ADR-0111): two
// taps — easier, harder — that re-pitch the whole un-performed tail relative to what the plan
// already says. The offset posted is *absolute*, so a double-tap is idempotent rather than
// two notches.
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
  const [error, setError] = useState<string | null>(null);
  const [caveat, setCaveat] = useState<boolean>(false);
  const [isPending, startTransition] = useTransition();

  const view = calibrationControlView(protocol);

  function calibrate(target: number | null): void {
    if (target === null) {
      return;
    }
    setError(null);
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span
            id="calibration-label"
            className="label-mono text-[10px] text-text-secondary"
          >
            PITCH // REMAINING SESSIONS
          </span>
          <span className="font-sans text-[15px] font-medium break-words text-text-primary">
            {view.summary}
          </span>
        </div>

        {/* The action cluster wraps and may shrink (ADR-0085/0087). It must not be
            `shrink-0`: the buttons are sized in `rem`, so at 200% text they double while the
            viewport keeps its 320 pixels, and a rigid three-button row cannot fit. The rail
            state is the worst case — it is the one that renders the third button — so this
            stacks rather than widening the document. */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <PitchButton
            label="Make remaining sessions easier"
            short="Easier"
            icon={ArrowDown}
            target={view.easier.target}
            enabled={view.easier.enabled}
            busy={isPending}
            onPick={calibrate}
          />
          <PitchButton
            label="Make remaining sessions harder"
            short="Harder"
            icon={ArrowUp}
            target={view.harder.target}
            enabled={view.harder.enabled}
            busy={isPending}
            onPick={calibrate}
          />
          {view.reset.enabled ? (
            <PitchButton
              label="Return remaining sessions to the written plan"
              short="Reset"
              icon={RotateCcw}
              target={view.reset.target}
              enabled
              busy={isPending}
              onPick={calibrate}
            />
          ) : null}
        </div>
      </div>

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

interface PitchButtonProps {
  // The full accessible name. The visible text is a single word, so the button needs its own
  // label to say *what* it re-pitches — "Easier" alone names no object.
  label: string;
  short: string;
  icon: React.ElementType;
  target: number | null;
  enabled: boolean;
  busy: boolean;
  onPick: (target: number | null) => void;
}

// One direction of the control. A native `<button>`, so `globals.css`'s tap-target rule gives
// it `touch-action: manipulation` and the first tap answers (ADR-0099).
function PitchButton({
  label,
  short,
  icon: Icon,
  target,
  enabled,
  busy,
  onPick,
}: PitchButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={!enabled || busy}
      onClick={() => onPick(target)}
      className={cn(
        buttonVariants({ variant: "outline", size: "sm" }),
        "gap-1.5 transition-colors motion-reduce:transition-none",
      )}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
      ) : (
        <Icon className="h-3.5 w-3.5" aria-hidden />
      )}
      <span className="label-mono text-[10px]">{short}</span>
    </button>
  );
}
