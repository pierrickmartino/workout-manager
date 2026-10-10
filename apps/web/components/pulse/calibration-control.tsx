"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Loader2, Minus, Plus, RotateCcw } from "@/components/pulse/icons";

import {
  calibrateCurrentProtocol,
  readCurrentCalibration,
} from "@/app/dashboard/calibration-actions";
import {
  CALIBRATION_EFFECT,
  SENSITIVE_CAVEAT,
  calibrationControlView,
  calibrationNotice,
  reconcileCalibration,
  type CalibrationNotice,
  type CalibrationReconciliation,
} from "@/lib/calibration-control";
import type { ProtocolProgress } from "@/lib/protocols-types";
import { Alert } from "@/components/pulse/alert";
import { cn } from "@/lib/utils";

// What the control is saying about the last post: a server refusal, or an uncertain result
// reconciled against the stored offset. `retryTarget` is the absolute offset a retry re-posts
// — retained, never recomputed from a readout that may be stale — or `null` for no retry.
interface ControlNotice extends CalibrationNotice {
  retryTarget: number | null;
}

// A reconciled post: the outcome, and the caveat when the quiet re-post recovered it (`null`
// when unknown, so a stale caveat is left as it was rather than cleared).
interface Reconciled {
  outcome: CalibrationReconciliation;
  sensitiveCaveat: boolean | null;
}

interface CalibrationControlProps {
  // The Current Protocol, read server-side. Its `calibration` and the clamp's bounds come
  // straight off the payload (ADR-0111), so this component asserts nothing about ±3.
  protocol: ProtocolProgress;
}

// The Home control for a Protocol's **Calibration** (GLOSSARY "Calibration", ADR-0111): a
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
//
// A post that throws is **uncertain**, not failed: it may have died before the server committed
// or lost its reply after. The control re-reads the stored offset to tell which, and offers a
// retry of the same absolute target when it did not save or cannot tell (ADR-0111, "Uncertain
// results"). The stepper stays live meanwhile: any later tap is itself absolute.
export function CalibrationControl({
  protocol,
}: CalibrationControlProps): React.JSX.Element {
  const labelId = useId();
  const [notice, setNotice] = useState<ControlNotice | null>(null);
  const [caveat, setCaveat] = useState<boolean>(false);
  // Which target is in flight, so the spinner sits on the end that was tapped.
  const [posting, setPosting] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  // The latest attempt; a result from an older one is dropped rather than painted over it.
  const attemptRef = useRef(0);

  const view = calibrationControlView(protocol);
  const spinsFor = (target: number | null): boolean =>
    isPending && target !== null && posting === target;

  function calibrate(target: number | null): void {
    if (target === null) {
      return;
    }
    const attempt = ++attemptRef.current;
    const isCurrent = (): boolean => attempt === attemptRef.current;
    setNotice(null);
    setPosting(target);
    startTransition(async () => {
      try {
        const result = await calibrateCurrentProtocol(protocol.id, target);
        if (!isCurrent()) {
          return;
        }
        if (result.error) {
          setNotice({ tone: "error", message: result.error, retryTarget: null });
          return;
        }
        setCaveat(result.sensitiveCaveat);
      } catch {
        const { outcome, sensitiveCaveat } = await reconcile(target);
        if (!isCurrent()) {
          return;
        }
        if (sensitiveCaveat !== null) {
          setCaveat(sensitiveCaveat);
        }
        const reconciled = calibrationNotice(outcome);
        setNotice(reconciled ? { ...reconciled, retryTarget: target } : null);
      }
    });
  }

  // Settle a post whose reply never came by reading what the server stored. When it did save,
  // the same absolute target is quietly re-posted for the one thing a read cannot carry — the
  // Sensitive Constraint caveat — and if that fails too, the read has already proven the save.
  async function reconcile(target: number): Promise<Reconciled> {
    let stored: number | null = null;
    try {
      stored = (await readCurrentCalibration(protocol.id)).calibration;
    } catch {
      stored = null;
    }
    const outcome = reconcileCalibration(target, stored);
    if (outcome !== "saved") {
      return { outcome, sensitiveCaveat: null };
    }
    try {
      const again = await calibrateCurrentProtocol(protocol.id, target);
      return { outcome, sensitiveCaveat: again.error ? null : again.sensitiveCaveat };
    } catch {
      // Saved per the read; only the caveat is unknown, and the next re-pitch reports it.
      return { outcome, sensitiveCaveat: null };
    }
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

      {notice ? (
        <Alert tone={notice.tone} announce>
          <p>{notice.message}</p>
          {notice.retryTarget !== null ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => calibrate(notice.retryTarget)}
              className="mt-2 font-medium underline underline-offset-4 disabled:opacity-50"
            >
              Try again
            </button>
          ) : null}
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
