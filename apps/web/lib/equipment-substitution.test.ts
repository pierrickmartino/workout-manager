import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EQUIPMENT_SUBSTITUTION_APPLY_FALLBACK_ERROR,
  EQUIPMENT_SUBSTITUTION_PREVIEW_FALLBACK_ERROR,
  LIVE_SESSION_LOCK_NOTE,
  canConfirmEquipmentSubstitution,
  equipmentSubstitutionButtonView,
  equipmentSubstitutionReducer,
  initialEquipmentSubstitutionState,
  outcomeSummary,
  outcomeRows,
  previewRows,
  selectedPositions,
  toApplyResult,
  toPreviewResult,
  type BlockedRow,
  type EquipmentSubstitutionState,
  type PositionOutcome,
} from "./equipment-substitution.ts";
import type { ExercisePrescription, WorkoutSession } from "./sessions-types.ts";

// The "Missing equipment?" sheet's view-model (ADR-0143, #791): the action's availability (the
// Live Session lock, the performed-Protocol guard, offline), the Available Equipment picker
// (Default Equipment pre-fill, Bodyweight only), the preview rows with untick, and the outcome
// rows with flagged failures.

const BENCH: BlockedRow = {
  position: 2,
  exercise_id: 11,
  exercise_name: "Barbell Bench Press",
  substitute: { exercise_id: 12, name: "Push-up" },
  needs_generation: false,
};
const ROW: BlockedRow = {
  position: 3,
  exercise_id: 13,
  exercise_name: "Barbell Row",
  substitute: null,
  needs_generation: true,
};

function opened(defaultEquipment: readonly string[] = ["barbell", "bench"]) {
  return equipmentSubstitutionReducer(initialEquipmentSubstitutionState, {
    type: "opened",
    defaultEquipment,
  });
}

function previewing(rows: BlockedRow[] = [BENCH, ROW]): EquipmentSubstitutionState {
  const requested = equipmentSubstitutionReducer(opened(), { type: "previewRequested" });
  return equipmentSubstitutionReducer(requested, { type: "previewLoaded", rows });
}

function prescription(position: number, exerciseName: string): ExercisePrescription {
  return { position, exercise_name: exerciseName } as ExercisePrescription;
}

function sessionWith(...prescriptions: ExercisePrescription[]): WorkoutSession {
  return { id: 7, prescriptions } as WorkoutSession;
}

// --- Availability ------------------------------------------------------------------------

test("the action is offered and enabled where Substitute is, online, with no Live Session", () => {
  const view = equipmentSubstitutionButtonView({
    sessionId: 7,
    showSubstitute: true,
    liveSessionId: null,
    online: true,
  });

  assert.deepEqual(view, { visible: true, disabled: false, note: null });
});

test("the action is withheld where Substitute is withheld (a performed Protocol Session)", () => {
  const view = equipmentSubstitutionButtonView({
    sessionId: 7,
    showSubstitute: false,
    liveSessionId: null,
    online: true,
  });

  assert.equal(view.visible, false);
});

test("a Live Session for this Session disables the action with a finish-or-discard note", () => {
  const view = equipmentSubstitutionButtonView({
    sessionId: 7,
    showSubstitute: true,
    liveSessionId: 7,
    online: true,
  });

  assert.deepEqual(view, { visible: true, disabled: true, note: LIVE_SESSION_LOCK_NOTE });
  assert.equal(LIVE_SESSION_LOCK_NOTE, "Finish or discard your live session first.");
});

test("a Live Session for another Session does not lock this one", () => {
  const view = equipmentSubstitutionButtonView({
    sessionId: 7,
    showSubstitute: true,
    liveSessionId: 8,
    online: true,
  });

  assert.equal(view.disabled, false);
});

test("offline disables the action with a reconnect note", () => {
  const view = equipmentSubstitutionButtonView({
    sessionId: 7,
    showSubstitute: true,
    liveSessionId: null,
    online: false,
  });

  assert.equal(view.disabled, true);
  assert.equal(view.note, "Offline — reconnect to substitute");
});

// --- Picker ------------------------------------------------------------------------------

test("opening pre-fills the picker with the Default Equipment", () => {
  const state = opened(["bench", "barbell", "bodyweight"]);

  assert.deepEqual(state, { step: "picking", equipment: ["barbell", "bench"], error: null });
});

test("Bodyweight only clears the selection in one tap", () => {
  const state = equipmentSubstitutionReducer(opened(), { type: "bodyweightOnlyChosen" });

  assert.equal(state.step, "picking");
  assert.deepEqual(state.step === "picking" && state.equipment, []);
});

test("toggling a piece of equipment adds or removes it", () => {
  const removed = equipmentSubstitutionReducer(opened(), {
    type: "equipmentToggled",
    item: "barbell",
  });
  const added = equipmentSubstitutionReducer(removed, {
    type: "equipmentToggled",
    item: "dumbbell",
  });

  assert.deepEqual(added.step === "picking" && added.equipment, ["dumbbell", "bench"]);
});

test("a failed preview returns to the picker with the server’s message or a fallback", () => {
  const requested = equipmentSubstitutionReducer(opened(), { type: "previewRequested" });

  const failed = equipmentSubstitutionReducer(requested, {
    type: "previewFailed",
    message: "A performed Protocol Session can’t be changed.",
  });

  assert.deepEqual(failed, {
    step: "picking",
    equipment: ["barbell", "bench"],
    error: "A performed Protocol Session can’t be changed.",
  });
  assert.deepEqual(toPreviewResult({ success: false, data: null, error: null }), {
    ok: false,
    message: EQUIPMENT_SUBSTITUTION_PREVIEW_FALLBACK_ERROR,
  });
});

// --- Preview -----------------------------------------------------------------------------

test("preview rows name the catalog substitute or say it will be generated, all selected", () => {
  assert.deepEqual(previewRows(previewing()), [
    {
      position: 2,
      exerciseName: "Barbell Bench Press",
      replacement: "Push-up",
      selected: true,
    },
    {
      position: 3,
      exerciseName: "Barbell Row",
      replacement: "Will be generated",
      selected: true,
    },
  ]);
  assert.deepEqual(selectedPositions(previewing()), [2, 3]);
});

test("unticking a row deselects it, and ticking it again brings it back", () => {
  const unticked = equipmentSubstitutionReducer(previewing(), {
    type: "rowToggled",
    position: 2,
  });
  const reticked = equipmentSubstitutionReducer(unticked, { type: "rowToggled", position: 2 });

  assert.deepEqual(
    previewRows(unticked).map((row) => row.selected),
    [false, true],
  );
  assert.deepEqual(selectedPositions(unticked), [3]);
  assert.deepEqual(selectedPositions(reticked), [2, 3]);
});

test("confirm needs at least one selected row", () => {
  let state = equipmentSubstitutionReducer(previewing(), { type: "rowToggled", position: 2 });
  assert.equal(canConfirmEquipmentSubstitution(state), true);

  state = equipmentSubstitutionReducer(state, { type: "rowToggled", position: 3 });
  assert.equal(canConfirmEquipmentSubstitution(state), false);
  assert.equal(canConfirmEquipmentSubstitution(previewing([])), false);
});

test("going back from the preview keeps the chosen equipment", () => {
  const back = equipmentSubstitutionReducer(previewing(), { type: "backToPicker" });

  assert.deepEqual(back, { step: "picking", equipment: ["barbell", "bench"], error: null });
});

test("declining closes the sheet and leaves nothing behind", () => {
  const closed = equipmentSubstitutionReducer(previewing(), { type: "closed" });

  assert.deepEqual(closed, initialEquipmentSubstitutionState);
});

test("a failed apply stays on the preview with the error and the same selection", () => {
  const unticked = equipmentSubstitutionReducer(previewing(), {
    type: "rowToggled",
    position: 2,
  });
  const applying = equipmentSubstitutionReducer(unticked, { type: "applyRequested" });

  const failed = equipmentSubstitutionReducer(applying, {
    type: "applyFailed",
    message: "Boom",
  });

  assert.equal(failed.step, "preview");
  assert.equal(failed.step === "preview" && failed.error, "Boom");
  assert.deepEqual(selectedPositions(failed), [3]);
  assert.deepEqual(toApplyResult({ success: false, data: null, error: null }), {
    ok: false,
    message: EQUIPMENT_SUBSTITUTION_APPLY_FALLBACK_ERROR,
  });
});

// --- Outcome -----------------------------------------------------------------------------

test("outcome rows report each substitution and flag a failed row kept as prescribed", () => {
  const outcomes: PositionOutcome[] = [
    { position: 2, status: "substituted", source: "catalog", reason: null },
    {
      position: 3,
      status: "failed",
      source: null,
      reason: "No alternative found for this equipment.",
    },
  ];
  const session = sessionWith(prescription(2, "Push-up"), prescription(3, "Barbell Row"));
  const applying = equipmentSubstitutionReducer(previewing(), { type: "applyRequested" });

  const done = equipmentSubstitutionReducer(applying, { type: "applied", session, outcomes });

  assert.deepEqual(outcomeRows(done), [
    {
      position: 2,
      exerciseName: "Barbell Bench Press",
      detail: "Now Push-up · from the catalog",
      flagged: false,
    },
    {
      position: 3,
      exerciseName: "Barbell Row",
      detail: "No alternative found for this equipment. Kept as prescribed.",
      flagged: true,
    },
  ]);
  assert.equal(outcomeSummary(done), "1 substituted · 1 flagged");
});

test("a generated substitute is labelled as generated", () => {
  const outcomes: PositionOutcome[] = [
    { position: 3, status: "substituted", source: "generated", reason: null },
  ];
  const session = sessionWith(prescription(3, "Band Row"));
  const applying = equipmentSubstitutionReducer(previewing(), { type: "applyRequested" });
  const done = equipmentSubstitutionReducer(applying, {
    type: "applied",
    session,
    outcomes,
  });

  assert.equal(outcomeRows(done)[0].detail, "Now Band Row · generated");
  assert.equal(outcomeSummary(done), "1 substituted");
});

test("an apply envelope maps onto the outcomes", () => {
  const session = sessionWith();
  const outcomes: PositionOutcome[] = [];

  assert.deepEqual(
    toApplyResult({ success: true, data: { session, outcomes }, error: null }),
    { ok: true, session, outcomes },
  );
  assert.deepEqual(
    toPreviewResult({ success: true, data: { rows: [BENCH] }, error: null }),
    { ok: true, rows: [BENCH] },
  );
});
