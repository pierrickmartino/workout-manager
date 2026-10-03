import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SENSITIVE_CAVEAT,
  calibrationControlView,
  calibrationSummary,
} from "./calibration-control.ts";
import type { ProtocolProgress } from "./protocols-types.ts";

// A minimal Protocol fixture — only the three Calibration fields carry meaning; the rest
// are harmless placeholders so the fixture type-checks. The bounds are stated rather than
// defaulted, because the whole point is that the view reads them from the server.
function makeProtocol(
  overrides: Partial<ProtocolProgress> = {},
): ProtocolProgress {
  return {
    id: 1,
    clerk_user_id: "user_1",
    training_type: "strength",
    objective: "hypertrophy",
    sessions_per_week: 3,
    weeks: 4,
    duration_minutes: 45,
    name: null,
    label: "hypertrophy · strength",
    sessions: [],
    next_session: null,
    completed_count: 0,
    calibration: 0,
    calibration_min: -3,
    calibration_max: 3,
    ...overrides,
  };
}

// --- the readout: a relative phrase, never a score -------------------------------------

test("an uncalibrated plan reads as written, not as a zero", () => {
  assert.equal(calibrationSummary(0), "Pitched as written");
});

test("one notch reads in the singular", () => {
  assert.equal(calibrationSummary(-1), "Pitched 1 notch easier");
});

test("several notches read in the plural", () => {
  assert.equal(calibrationSummary(2), "Pitched 2 notches harder");
});

test("the readout never names a level or a score", () => {
  // CONTEXT 'Calibration' puts "difficulty level" and "calibration score" under _Avoid_;
  // the offset is relative to what the plan already says, so the copy must stay relative.
  for (const value of [-3, -1, 0, 1, 3]) {
    const summary = calibrationSummary(value).toLowerCase();
    assert.ok(!summary.includes("level"), `"${summary}" names a level`);
    assert.ok(!summary.includes("score"), `"${summary}" names a score`);
  }
});

// --- the two directions ----------------------------------------------------------------

test("both directions are offered from the authored plan", () => {
  const view = calibrationControlView(makeProtocol({ calibration: 0 }));

  assert.equal(view.easier.target, -1);
  assert.equal(view.harder.target, 1);
  assert.ok(view.easier.enabled);
  assert.ok(view.harder.enabled);
});

test("each direction posts an absolute offset, not a delta", () => {
  // Idempotence (ADR-0111): a double-tapped control lands on the offset the user can see.
  const view = calibrationControlView(makeProtocol({ calibration: -2 }));

  assert.equal(view.easier.target, -3);
  assert.equal(view.harder.target, -1);
});

test("the easier direction is refused at the floor", () => {
  const view = calibrationControlView(makeProtocol({ calibration: -3 }));

  assert.equal(view.easier.target, null);
  assert.equal(view.easier.enabled, false);
  // The other direction stays open — a rail is not a lockout.
  assert.ok(view.harder.enabled);
});

test("the harder direction is refused at the ceiling", () => {
  const view = calibrationControlView(makeProtocol({ calibration: 3 }));

  assert.equal(view.harder.target, null);
  assert.equal(view.harder.enabled, false);
  assert.ok(view.easier.enabled);
});

test("the bounds are read from the server, never assumed", () => {
  // A server that narrowed the clamp must narrow the control with no frontend change.
  const view = calibrationControlView(
    makeProtocol({ calibration: 1, calibration_min: -1, calibration_max: 1 }),
  );

  assert.equal(view.harder.enabled, false);
  assert.equal(view.easier.target, 0);
});

// --- the rail explains itself ----------------------------------------------------------

test("no rail note between the rails", () => {
  assert.equal(calibrationControlView(makeProtocol({ calibration: 1 })).railNote, null);
});

test("the floor explains itself and points at the fitness level", () => {
  // ADR-0111: hitting the rail is what hands the user to the Fitness Level fold, so the
  // note must say so — an inert control that never explains itself is a defect.
  const note = calibrationControlView(makeProtocol({ calibration: -3 })).railNote;

  assert.ok(note);
  assert.match(note, /fitness level/i);
});

test("the ceiling explains itself too", () => {
  const note = calibrationControlView(makeProtocol({ calibration: 3 })).railNote;

  assert.ok(note);
  assert.match(note, /fitness level/i);
});

// --- returning to the authored plan ----------------------------------------------------

test("no reset is offered when the plan is already as written", () => {
  const view = calibrationControlView(makeProtocol({ calibration: 0 }));

  assert.equal(view.reset.target, null);
  assert.equal(view.reset.enabled, false);
});

test("the reset posts zero from any offset", () => {
  for (const calibration of [-3, -1, 2, 3]) {
    const view = calibrationControlView(makeProtocol({ calibration }));
    assert.equal(view.reset.target, 0, `offset ${calibration}`);
    assert.ok(view.reset.enabled);
  }
});

// --- defensive reads -------------------------------------------------------------------

test("an out-of-bounds stored offset is clamped for display", () => {
  // The server clamps on write, so this should be unreachable — but a stale payload must
  // not render a control that offers a fifth notch.
  const view = calibrationControlView(makeProtocol({ calibration: -9 }));

  assert.equal(view.value, -3);
  assert.equal(view.easier.enabled, false);
});

// --- the safety posture ----------------------------------------------------------------

test("the sensitive caveat is a caveat, not a refusal", () => {
  // ADR-0058's precedent: the copy must not say the act was blocked, because it was not.
  const copy = SENSITIVE_CAVEAT.toLowerCase();

  assert.ok(!copy.includes("cannot"));
  assert.ok(!copy.includes("not allowed"));
  assert.ok(!copy.includes("blocked"));
});

test("every string the control shows is typeset with a real apostrophe", () => {
  // ADR-0101: the apostrophe is ’, not '. The sweep covers lib/ too, but the rule is worth
  // an assertion on the copy this module owns.
  const copy = [
    SENSITIVE_CAVEAT,
    calibrationControlView(makeProtocol({ calibration: -3 })).railNote ?? "",
    calibrationControlView(makeProtocol({ calibration: 3 })).railNote ?? "",
    calibrationSummary(0),
  ].join(" ");

  assert.ok(!/[a-z]'[a-z]/i.test(copy), "a straight apostrophe is present");
});
