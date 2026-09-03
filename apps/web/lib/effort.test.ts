import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_EFFORT_SCALE,
  KNOWN_EFFORT_SCALES,
  NO_EFFORT,
  effortAsRir,
  effortAsRpe,
  effortFromPerceivedDifficulty,
  effortScaleLabel,
  formatEffort,
  loggedSetEffort,
  projectEffort,
} from "./effort.ts";

test("the scale catalog and default mirror the backend vocabulary", () => {
  // The frontend union must not drift from the backend's closed EffortScale enum.
  assert.deepEqual([...KNOWN_EFFORT_SCALES], ["rpe", "rir"]);
  assert.equal(DEFAULT_EFFORT_SCALE, "rpe");
});

test("effortScaleLabel returns the scale's short label", () => {
  assert.equal(effortScaleLabel("rpe"), "RPE");
  assert.equal(effortScaleLabel("rir"), "RIR");
});

test("effortAsRpe reads an RPE value straight through", () => {
  assert.equal(effortAsRpe({ scale: "rpe", value: 6.5 }), 6.5);
});

test("effortAsRpe projects an RIR value by the 10 − rir relation", () => {
  // 3 reps in reserve ≈ RPE 7 — the relation the progression gate also uses.
  assert.equal(effortAsRpe({ scale: "rir", value: 3 }), 7);
});

test("effortAsRir reads an RIR value straight through and projects an RPE value", () => {
  assert.equal(effortAsRir({ scale: "rir", value: 2 }), 2);
  assert.equal(effortAsRir({ scale: "rpe", value: 8 }), 2);
});

test("projectEffort to the same scale returns the input unchanged", () => {
  const rpe = { scale: "rpe", value: 7 } as const;
  assert.equal(projectEffort(rpe, "rpe"), rpe);
});

test("projectEffort to RPE carries the exact value", () => {
  assert.deepEqual(projectEffort({ scale: "rir", value: 3 }, "rpe"), {
    scale: "rpe",
    value: 7,
  });
});

test("projectEffort to RIR rounds and clamps into the 0–5 band", () => {
  // A half-step RPE projects to an integer RIR (10 − 6.5 = 3.5 → 4 under round-half-up)…
  assert.deepEqual(projectEffort({ scale: "rpe", value: 6.5 }, "rir"), {
    scale: "rir",
    value: 4,
  });
  // …and a very low RPE clamps at the "5+" ceiling rather than exceeding it.
  assert.deepEqual(projectEffort({ scale: "rpe", value: 2 }, "rir"), {
    scale: "rir",
    value: 5,
  });
});

test("formatEffort renders each scale in its conventional word order", () => {
  assert.equal(formatEffort({ scale: "rpe", value: 7 }), "RPE 7");
  assert.equal(formatEffort({ scale: "rpe", value: 6.5 }), "RPE 6.5");
  assert.equal(formatEffort({ scale: "rir", value: 3 }), "3 RIR");
});

test("formatEffort projects into the reader's preferred scale", () => {
  // A set logged in RIR, displayed to a reader who thinks in RPE.
  assert.equal(formatEffort({ scale: "rir", value: 3 }, "rpe"), "RPE 7");
  // …and the reverse.
  assert.equal(formatEffort({ scale: "rpe", value: 8 }, "rir"), "2 RIR");
});

test("formatEffort falls back to the em dash when no effort was recorded", () => {
  assert.equal(formatEffort(null), NO_EFFORT);
  assert.equal(formatEffort(undefined), NO_EFFORT);
});

test("effortFromPerceivedDifficulty reads the legacy int as an RPE-scale Effort", () => {
  assert.deepEqual(effortFromPerceivedDifficulty(8), { scale: "rpe", value: 8 });
  assert.equal(effortFromPerceivedDifficulty(null), null);
  assert.equal(effortFromPerceivedDifficulty(undefined), null);
});

test("loggedSetEffort prefers the typed effort over the legacy mirror", () => {
  // A dual-written set carries both; the typed value is authoritative for display.
  const set = { effort: { scale: "rir", value: 3 } as const, perceived_difficulty: 7 };
  assert.deepEqual(loggedSetEffort(set), { scale: "rir", value: 3 });
});

test("loggedSetEffort falls back to the legacy int when there is no typed effort", () => {
  const set = { effort: null, perceived_difficulty: 8 };
  assert.deepEqual(loggedSetEffort(set), { scale: "rpe", value: 8 });
});

test("loggedSetEffort is null when a set carries no effort at all", () => {
  assert.equal(loggedSetEffort({ effort: null, perceived_difficulty: null }), null);
});
