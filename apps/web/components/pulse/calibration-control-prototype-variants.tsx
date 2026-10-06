"use client";

// PROTOTYPE — throwaway (branch `prototype/calibration-widget`). Three structurally different
// takes on the Home Calibration control (ADR-0111), each fed the same stub. They differ in
// primary affordance, not paint:
//
//   A · Stepper    — one control, − / + around a centred readout. Relative moves only.
//   B · Track      — the whole −3…+3 range drawn as seven cells, tap any to jump there.
//   C · Feel check — collapsed to a status line; opens on a question in the user's words.
//
// All three swap "Pitched 2 notches harder" for "2 steps harder", and say what the act
// changes. That copy is part of what is being judged, not a fixed given.

import { useId, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Minus,
  Plus,
  RotateCcw,
} from "@/components/pulse/icons";

import type { CalibrationControlView } from "@/lib/calibration-control";
import { Alert } from "@/components/pulse/alert";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CalibrationVariantProps {
  view: CalibrationControlView;
  busy: boolean;
  onPick: (target: number | null) => void;
}

// The bounds the track draws. The view-model does not carry them (it never needed the range),
// so the prototype reads the same ±3 the fixtures carry; folding B in would add them to the view.
const TRACK_MIN = -3;
const TRACK_MAX = 3;

const EFFECT =
  "Adjusts load, sets or rest on every session you haven’t done yet. Done sessions stay as they are.";

function stepsPhrase(value: number): string {
  if (value === 0) {
    return "As written";
  }
  const steps = Math.abs(value);
  return `${steps} ${steps === 1 ? "step" : "steps"} ${value < 0 ? "easier" : "harder"}`;
}

// ── A · Stepper ────────────────────────────────────────────────────────────────────────────
// The two directions become the two ends of one control, with the standing offset between
// them — so the readout sits where the eye already is when tapping. Reset moves out of the
// button row into a quiet link that keeps its space when hidden (no row reflow at 0).
export function VariantStepper({ view, busy, onPick }: CalibrationVariantProps): React.JSX.Element {
  const labelId = useId();
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span id={labelId} className="label-mono text-[10px] text-text-secondary">
          PITCH // REMAINING SESSIONS
        </span>
        <button
          type="button"
          aria-label="Return remaining sessions to the written plan"
          disabled={busy}
          onClick={() => onPick(view.reset.target)}
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium text-cyan underline-offset-4 hover:underline disabled:opacity-50",
            !view.reset.enabled && "invisible",
          )}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Back to plan
        </button>
      </div>

      <div
        role="group"
        aria-labelledby={labelId}
        className="flex items-stretch overflow-hidden rounded-sm border border-border-lite"
      >
        <StepperEnd
          label="Make remaining sessions easier"
          short="Easier"
          icon={Minus}
          enabled={view.easier.enabled && !busy}
          onClick={() => onPick(view.easier.target)}
        />
        <div
          aria-live="polite"
          className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 border-x border-border-lite bg-base px-2 py-3 text-center"
        >
          <span className="min-w-0 break-words font-display text-xl font-semibold text-text-primary">
            {view.value === 0
              ? "As written"
              : `${Math.abs(view.value)} ${Math.abs(view.value) === 1 ? "step" : "steps"}`}
          </span>
          <span className="label-mono text-[10px] text-text-muted">
            {view.value === 0
              ? "THE PLAN AS GENERATED"
              : view.value < 0
                ? "EASIER THAN WRITTEN"
                : "HARDER THAN WRITTEN"}
          </span>
        </div>
        <StepperEnd
          label="Make remaining sessions harder"
          short="Harder"
          icon={Plus}
          enabled={view.harder.enabled && !busy}
          onClick={() => onPick(view.harder.target)}
        />
      </div>

      <p className="text-xs leading-relaxed text-text-muted">{EFFECT}</p>

      {view.railNote ? (
        <Alert tone="info" announce>
          {view.railNote}
        </Alert>
      ) : null}
    </Card>
  );
}

interface StepperEndProps {
  label: string;
  short: string;
  icon: React.ElementType;
  enabled: boolean;
  onClick: () => void;
}

function StepperEnd({ label, short, icon: Icon, enabled, onClick }: StepperEndProps): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={!enabled}
      onClick={onClick}
      className="flex min-w-0 shrink-0 flex-col items-center justify-center gap-1 px-4 py-3 text-text-secondary transition-colors hover:bg-elevated hover:text-text-primary disabled:opacity-50 motion-reduce:transition-none"
    >
      <Icon className="h-5 w-5" aria-hidden />
      <span className="label-mono text-[10px]">{short}</span>
    </button>
  );
}

// ── B · Track ──────────────────────────────────────────────────────────────────────────────
// The whole clamp, drawn. The rails stop being a surprise (you can see there are three steps
// each way), and any offset is one tap — which the API already supports, since the posted
// offset is absolute. The tension to judge: ADR-0111 says "never a position on a scale", and
// this is the one variant that looks like one. The centre is labelled as the plan itself, not
// as a zero, to keep it reading as *relative to what was written*.
export function VariantTrack({ view, busy, onPick }: CalibrationVariantProps): React.JSX.Element {
  const labelId = useId();
  const offsets = Array.from({ length: TRACK_MAX - TRACK_MIN + 1 }, (_, i) => TRACK_MIN + i);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span id={labelId} className="label-mono text-[10px] text-text-secondary">
          PITCH // REMAINING SESSIONS
        </span>
        <span aria-live="polite" className="font-sans text-[15px] font-medium text-text-primary">
          {stepsPhrase(view.value)}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div role="group" aria-labelledby={labelId} className="flex items-stretch gap-1">
          {offsets.map((offset) => (
            <TrackCell
              key={offset}
              offset={offset}
              value={view.value}
              busy={busy}
              onPick={onPick}
            />
          ))}
        </div>
        <div className="flex items-center justify-between gap-2" aria-hidden>
          <span className="label-mono flex items-center gap-1 text-[10px] text-text-muted">
            <ArrowDown className="h-3 w-3" /> EASIER
          </span>
          <span className="label-mono text-[10px] text-text-secondary">AS WRITTEN</span>
          <span className="label-mono flex items-center gap-1 text-[10px] text-text-muted">
            HARDER <ArrowUp className="h-3 w-3" />
          </span>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-text-muted">{EFFECT}</p>

      {view.railNote ? (
        <Alert tone="info" announce>
          {view.railNote}
        </Alert>
      ) : null}
    </Card>
  );
}

interface TrackCellProps {
  offset: number;
  value: number;
  busy: boolean;
  onPick: (target: number | null) => void;
}

function TrackCell({ offset, value, busy, onPick }: TrackCellProps): React.JSX.Element {
  const isCurrent = offset === value;
  const isPlan = offset === 0;
  // Filled from the plan out to the standing offset, so the run reads as "how far from written".
  const isFilled = offset !== 0 && Math.sign(offset) === Math.sign(value) && Math.abs(offset) <= Math.abs(value);
  const label = isPlan ? "Return remaining sessions to the written plan" : `Set remaining sessions ${stepsPhrase(offset)}`;

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isCurrent}
      disabled={busy}
      onClick={() => (isCurrent ? undefined : onPick(offset))}
      className={cn(
        "flex h-11 min-w-0 flex-1 items-center justify-center rounded-sm border px-1 transition-colors disabled:opacity-50 motion-reduce:transition-none",
        isCurrent ? "border-cyan bg-cyan-dim" : "border-border hover:border-border-lite",
      )}
    >
      {isPlan ? (
        <span className={cn("h-5 w-0.5 rounded-full", isCurrent ? "bg-cyan" : "bg-text-secondary")} />
      ) : (
        <span
          className={cn(
            "h-1.5 w-full rounded-full",
            isFilled ? "bg-cyan" : "bg-elevated",
          )}
        />
      )}
    </button>
  );
}

// ── C · Feel check ─────────────────────────────────────────────────────────────────────────
// Calibration is a rare act, so it stops competing with Start session: the card is a status
// line until the user says the plan feels off. The choices are phrased as the complaint the
// user has ("asking too much"), not as the mechanism ("easier"), and each says what one tap
// does. After a pick the panel folds and the line confirms what changed.
export function VariantPrompt({ view, busy, onPick }: CalibrationVariantProps): React.JSX.Element {
  const panelId = useId();
  const [open, setOpen] = useState<boolean>(false);
  const [lastAct, setLastAct] = useState<"eased" | "pushed" | "reset" | null>(null);

  function choose(target: number | null, act: "eased" | "pushed" | "reset"): void {
    setLastAct(act);
    setOpen(false);
    onPick(target);
  }

  const confirmation =
    lastAct === null || busy
      ? null
      : lastAct === "reset"
        ? "Back to the written plan for every remaining session."
        : `${lastAct === "eased" ? "Eased" : "Pushed"} one step. Remaining sessions are now ${stepsPhrase(view.value).toLowerCase()}.`;

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="label-mono text-[10px] text-text-secondary">REMAINING SESSIONS</span>
          <span className="font-sans text-[15px] font-medium text-text-primary">
            {view.value === 0 ? "Running as written" : `Running ${stepsPhrase(view.value)}`}
          </span>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            setOpen(!open);
            setLastAct(null);
          }}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
        >
          <span className="text-xs">{open ? "Close" : "Plan feels off?"}</span>
          <ChevronDown className={cn("h-3.5 w-3.5", open && "rotate-180")} aria-hidden />
        </button>
      </div>

      {open ? (
        <div id={panelId} className="flex flex-col gap-2 border-t border-border pt-3">
          <p className="text-sm text-text-secondary">How have the sessions been feeling?</p>
          <FeelChoice
            icon={ArrowDown}
            title="Asking too much"
            description={
              view.easier.enabled ? "Ease every remaining session by one step" : "Already as easy as a re-pitch goes"
            }
            enabled={view.easier.enabled && !busy}
            onClick={() => choose(view.easier.target, "eased")}
          />
          <FeelChoice
            icon={ArrowUp}
            title="Asking too little"
            description={
              view.harder.enabled ? "Push every remaining session by one step" : "Already as hard as a re-pitch goes"
            }
            enabled={view.harder.enabled && !busy}
            onClick={() => choose(view.harder.target, "pushed")}
          />
          {view.reset.enabled ? (
            <FeelChoice
              icon={RotateCcw}
              title="Back to the written plan"
              description={`Undo the ${stepsPhrase(view.value).toLowerCase()} re-pitch`}
              enabled={!busy}
              onClick={() => choose(view.reset.target, "reset")}
            />
          ) : null}
          <p className="pt-1 text-xs leading-relaxed text-text-muted">{EFFECT}</p>
          {view.railNote ? <Alert tone="info">{view.railNote}</Alert> : null}
        </div>
      ) : null}

      {confirmation ? (
        <Alert tone="success" announce>
          {confirmation}
        </Alert>
      ) : null}
    </Card>
  );
}

interface FeelChoiceProps {
  icon: React.ElementType;
  title: string;
  description: string;
  enabled: boolean;
  onClick: () => void;
}

function FeelChoice({ icon: Icon, title, description, enabled, onClick }: FeelChoiceProps): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-sm border border-border px-3.5 py-3 text-left transition-colors hover:border-border-lite hover:bg-elevated disabled:opacity-50 motion-reduce:transition-none"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-sans text-sm font-medium text-text-primary">{title}</span>
        <span className="text-xs text-text-secondary">{description}</span>
      </span>
    </button>
  );
}
