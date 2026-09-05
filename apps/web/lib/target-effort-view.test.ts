import { test } from "node:test";
import assert from "node:assert/strict";

import {
  prescriptionTargetEffort,
  targetEffortFromInput,
  targetEffortLabel,
} from "./target-effort-view.ts";

// `target-effort-view` decides what the plan view shows for a movement's prescribed Target
// Effort (ADR-0066, #454): the typed target it carries, and a label projected into the
// reader's preferred scale (RPE⇄RIR), mirroring the kg/lb read-time projection. Target Effort
// is descriptive-only, so the rule under test is purely presentational — no target shows
// nothing, and a set target reads in whichever scale the reader prefers, from either stored
// scale. These tests pin the reader and the projection.

test("a prescription with no target reads null and renders no label", () => {
  assert.equal(prescriptionTargetEffort({ target_effort: null }), null);
  assert.equal(prescriptionTargetEffort({ target_effort: undefined }), null);
  assert.equal(targetEffortLabel({ target_effort: null }), null);
  assert.equal(targetEffortLabel({ target_effort: undefined }), null);
});

test("a prescription's target is read back as the typed Effort it stores", () => {
  const target = { scale: "rpe", value: 8 } as const;
  assert.deepEqual(prescriptionTargetEffort({ target_effort: target }), target);
});

test("a target label reads in its stored scale by default", () => {
  assert.equal(
    targetEffortLabel({ target_effort: { scale: "rpe", value: 8 } }),
    "Target RPE 8",
  );
  assert.equal(
    targetEffortLabel({ target_effort: { scale: "rir", value: 2 } }),
    "Target 2 RIR",
  );
});

test("a target label projects across scales at read time (RPE⇄RIR)", () => {
  // An RPE 8 target read in RIR is the equivalent 2 RIR; a 2 RIR target read in RPE is RPE 8 —
  // the same `10 − rir` relation the record-side effort projection uses.
  assert.equal(
    targetEffortLabel({ target_effort: { scale: "rpe", value: 8 } }, "rir"),
    "Target 2 RIR",
  );
  assert.equal(
    targetEffortLabel({ target_effort: { scale: "rir", value: 2 } }, "rpe"),
    "Target RPE 8",
  );
});

test("targetEffortFromInput reads a blank value as no target", () => {
  assert.equal(targetEffortFromInput("rpe", ""), null);
  assert.equal(targetEffortFromInput("rir", "   "), null);
});

test("targetEffortFromInput keeps the picked scale and never converts", () => {
  // The value rides onto the scale the editor chose — an "8" on RPE is RPE 8, an "8" on RIR
  // stays 8 RIR (not cross-converted), so the chip reads what was prescribed.
  assert.deepEqual(targetEffortFromInput("rpe", "8"), { scale: "rpe", value: 8 });
  assert.deepEqual(targetEffortFromInput("rir", "2"), { scale: "rir", value: 2 });
  assert.deepEqual(targetEffortFromInput("rir", "8"), { scale: "rir", value: 8 });
});

test("targetEffortFromInput keeps a half-step RPE value", () => {
  assert.deepEqual(targetEffortFromInput("rpe", "7.5"), { scale: "rpe", value: 7.5 });
});

test("targetEffortFromInput reads a non-numeric value as no target", () => {
  assert.equal(targetEffortFromInput("rpe", "hard"), null);
});

test("a half-step RPE target survives projection to RPE and rounds into the RIR band", () => {
  // RPE 7.5 read as RPE keeps the half-step; read as RIR it rounds to the nearest whole member.
  assert.equal(
    targetEffortLabel({ target_effort: { scale: "rpe", value: 7.5 } }, "rpe"),
    "Target RPE 7.5",
  );
  assert.equal(
    targetEffortLabel({ target_effort: { scale: "rpe", value: 7.5 } }, "rir"),
    "Target 3 RIR",
  );
});
