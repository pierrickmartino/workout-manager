import { test } from "node:test";
import assert from "node:assert/strict";

import { prescriptionPlanView } from "./prescription-plan-view.ts";
import type { ExercisePrescription } from "./sessions-types.ts";
import type { SupersetSlot } from "./supersets.ts";

// `prescription-plan-view` is the Session detail card's plan, read like the Live Session's set
// table (ADR-0114): one mono summary line and one row per prescribed set. Rest follows the
// Superset rule (ADR-0023): a solo movement shows its own, a grouped one only the round-rest, once,
// on the group's last member.

const BASE = {
  sets: 3,
  reps: "8-12",
  rest_seconds: 90,
  recommended_load: { kind: "absolute", text: "60kg", kg: 60 },
} as Pick<ExercisePrescription, "sets" | "reps" | "rest_seconds" | "recommended_load">;

const SOLO = undefined;
const member = (isLastMember: boolean): SupersetSlot =>
  ({ group: "a", memberLabel: "A1", isLastMember, roundRestSeconds: 120 }) as SupersetSlot;

test("a solo movement reads sets × reps · load · rest, with an en dash range", () => {
  const view = prescriptionPlanView(BASE, SOLO, "kg");
  assert.equal(view.summary, "3 × 8–12 · 60 kg · rest 90s");
  assert.equal(view.reps, "8–12");
  assert.equal(view.load, "60 kg");
  assert.deepEqual(view.setNumbers, [1, 2, 3]);
});

test("the load follows the reader's weight unit", () => {
  assert.equal(prescriptionPlanView(BASE, SOLO, "lb").load, "132.28 lb");
});

test("a movement with no load or rest leaves them out of the line", () => {
  const view = prescriptionPlanView(
    { ...BASE, recommended_load: null, rest_seconds: null },
    SOLO,
    "kg",
  );
  assert.equal(view.summary, "3 × 8–12");
  assert.equal(view.load, "—");
});

test("a Superset member's own rest is dormant; the last member carries the round-rest", () => {
  assert.equal(prescriptionPlanView(BASE, member(false), "kg").summary, "3 × 8–12 · 60 kg");
  assert.equal(
    prescriptionPlanView(BASE, member(true), "kg").summary,
    "3 × 8–12 · 60 kg · round rest 120s",
  );
});

test("a free-text target is shown as written", () => {
  assert.equal(prescriptionPlanView({ ...BASE, reps: "45s" }, SOLO, "kg").reps, "45s");
});
