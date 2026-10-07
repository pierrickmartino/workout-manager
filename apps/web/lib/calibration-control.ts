// Pure view-model for the Calibration control (ADR-0111). NO I/O and NO React or
// server-only imports, so it is unit-testable with `node --test` and the component stays
// thin — the repo rule for frontend logic.
//
// A Calibration is a *relative offset* from a Protocol's authored values, never a position
// on a scale, so this module never renders a number as a score. It turns the standing offset
// into the two things a control needs: what each direction would post, and what the current
// state reads as in words.
//
// The offset the control posts is **absolute**, not a delta, so the act is idempotent — a
// double-tap lands on the offset the user can see rather than two notches past it. The bounds
// come from the server on every Protocol read (ADR-0111 keeps the clamp server-side), so this
// module never hard-codes ±3.

import type { ProtocolProgress } from "./protocols-types";

// What one direction of the control can do right now.
export interface CalibrationStep {
  // The absolute offset this direction posts, or `null` when the rail refuses it.
  target: number | null;
  // Whether the control is interactive. False at the rail, where ADR-0111 requires the
  // control explain itself rather than silently stop responding.
  enabled: boolean;
}

// The complete presentation of the Calibration control for a Protocol's current state.
export interface CalibrationControlView {
  // The standing offset, as stored.
  value: number;
  // The offset in words — the control's only readout, deliberately not a number on a dial.
  summary: string;
  // The same offset split for the stepper: the count between its − and + ends, and the
  // direction under it, said against the written plan.
  readout: CalibrationReadout;
  // The two directions.
  easier: CalibrationStep;
  harder: CalibrationStep;
  // Whether a return to the authored plan is available, and the offset it posts (always 0).
  reset: CalibrationStep;
  // The rail explanation, or `null` when neither rail is reached. The one moment a
  // Calibration is not silent (ADR-0111): an inert control that never says why is a defect,
  // and the rail is where the Fitness Level fold takes over.
  railNote: string | null;
}

// The stepper's readout. Two lines rather than the one-line `summary`, because the count sits
// in the narrow cell between the two ends of the control and must not wrap there.
export interface CalibrationReadout {
  headline: string;
  direction: string;
}

// What a Calibration changes, in the user's words: ADR-0111's levers, and ADR-0020's promise
// that a performed Session is settled record. Shown under the control so the first tap is not
// the way a user finds out that it re-pitches the whole remaining plan.
export const CALIBRATION_EFFECT =
  "Adjusts load, sets or rest on every session you haven’t done yet. Done sessions stay as " +
  "they are.";

// The caveat a user with a Sensitive Constraint sees — a caveat, never a refusal
// (ADR-0058's precedent, carried into ADR-0111). Both directions stay available.
export const SENSITIVE_CAVEAT =
  "Your profile records a constraint we train cautiously around. This re-pitches your own " +
  "plan only — check it still suits you, and keep an eye on how it feels.";

const AT_EASIEST =
  "This is as easy as a re-pitch goes. If the plan still asks too much, your fitness level " +
  "is likely set too high — correcting it there will start your next protocol in the right " +
  "place.";

const AT_HARDEST =
  "This is as hard as a re-pitch goes. If the plan still asks too little, your fitness level " +
  "is likely set too low — correcting it there will start your next protocol in the right " +
  "place.";

// The offset in words. Written as a *relative* phrase in every case, because the number is an
// offset from what the plan already says and reading it as a level would be the one thing
// CONTEXT's _Avoid_ list forbids. A user-facing "step" is ADR-0111's notch.
export function calibrationSummary(value: number): string {
  if (value === 0) {
    return "As written";
  }
  return `${stepCount(value)} ${value < 0 ? "easier" : "harder"}`;
}

// The stepper's two-line readout of the same offset.
export function calibrationReadout(value: number): CalibrationReadout {
  if (value === 0) {
    return { headline: "As written", direction: "The plan as generated" };
  }
  return {
    headline: stepCount(value),
    direction: value < 0 ? "Easier than written" : "Harder than written",
  };
}

function stepCount(value: number): string {
  const steps = Math.abs(value);
  return `${steps} ${steps === 1 ? "step" : "steps"}`;
}

// Build the control's whole state from a Protocol read.
//
// `calibration`, `calibration_min` and `calibration_max` all arrive on every Protocol
// payload, with an uncalibrated Protocol already normalized to 0 server-side — so this never
// has to decide what an absent offset means. The bounds are read rather than assumed, so a
// server-side change to the clamp needs no change here.
export function calibrationControlView(
  protocol: ProtocolProgress,
): CalibrationControlView {
  const min = protocol.calibration_min;
  const max = protocol.calibration_max;
  const value = clamp(protocol.calibration, min, max);

  const atEasiest = value <= min;
  const atHardest = value >= max;

  return {
    value,
    summary: calibrationSummary(value),
    readout: calibrationReadout(value),
    easier: step(atEasiest ? null : value - 1),
    harder: step(atHardest ? null : value + 1),
    // Offered only when there is something to return from; posting 0 at 0 is a no-op the
    // server reports as unchanged, so showing the control there is noise.
    reset: step(value === 0 ? null : 0),
    railNote: atEasiest ? AT_EASIEST : atHardest ? AT_HARDEST : null,
  };
}

function step(target: number | null): CalibrationStep {
  return { target, enabled: target !== null };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
