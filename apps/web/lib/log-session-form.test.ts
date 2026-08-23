import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildLogForm,
  buildLogSet,
  buildLoggedSets,
  buildPinDialog,
  collectPinCandidates,
  deriveCompletionOutcome,
  normalizePinTarget,
  parseRepTarget,
  performedRepsForGroup,
  pinOffer,
  prescribedByPosition,
  prescribedRowCount,
  readLogFormRows,
  seededReps,
  skippedSetCount,
  type LogPrescriptionGroup,
  type LogRowFields,
  type LogSetRow,
} from "./log-session-form.ts";
import type { ExercisePrescription } from "./sessions-types.ts";
import type { Load } from "./load.ts";
import type { Quantity } from "./quantity.ts";

// `log-session-form` expands a Session's prescriptions into the per-set rows the static log
// form records, and derives the Completion Outcome from what the user marked done. The old
// form collapsed each prescription to one ungrouped row (losing the set count and the
// Supersets) and hardcoded "completed"; these tests pin the fidelity and the derivation.

function prescription(
  overrides: Partial<ExercisePrescription>,
): ExercisePrescription {
  return {
    position: 0,
    sets: 3,
    reps: "8",
    rest_seconds: null,
    tempo: null,
    recommended_load: null,
    exercise_id: 1,
    exercise_name: "Back Squat",
    exercise_description: null,
    targeted_muscles: [],
    required_equipment: [],
    provenance: "ai_generated",
    ...overrides,
  };
}

test("expands a prescription into one row per prescribed set", () => {
  // Arrange — a 4-set prescription
  const [group] = buildLogForm([prescription({ sets: 4 })]);

  // Assert — four rows, numbered 1..4, all Done by default (Model B)
  assert.equal(group.rows.length, 4);
  assert.deepEqual(
    group.rows.map((row) => row.setNumber),
    [1, 2, 3, 4],
  );
  assert.ok(group.rows.every((row) => row.done));
});

test("seeds reps from a clean integer, and leaves a range blank with a hint", () => {
  // Arrange — one integer-reps prescription and one range-reps prescription
  const groups = buildLogForm([
    prescription({ position: 0, reps: "5", sets: 1 }),
    prescription({ position: 1, reps: "8-12", sets: 1 }),
  ]);

  // Assert — the integer seeds the field; the range cannot fill a number input, so the
  // field is blank and the prescribed reps ride as the placeholder hint
  assert.equal(groups[0].rows[0].reps, "5");
  assert.equal(groups[1].rows[0].reps, "");
  assert.equal(groups[1].hint, "8-12");
});

test("seeds the load kind and value from the prescribed Load", () => {
  // Arrange — a percent-of-1RM prescribed load
  const [group] = buildLogForm([
    prescription({
      sets: 1,
      recommended_load: { kind: "percent_1rm", text: "70% 1RM", percent: 70 },
    }),
  ]);

  // Assert — the picker starts on the prescribed kind and value, editable
  assert.equal(group.rows[0].loadKind, "percent_1rm");
  assert.equal(group.rows[0].loadValue, "70");
});

test("carries the cosmetic Superset layout onto the groups", () => {
  // Arrange — two contiguous members of one Superset (ADR-0023)
  const groups = buildLogForm([
    prescription({ position: 0, exercise_id: 1, superset_group: "A", round_rest_seconds: 90 }),
    prescription({ position: 1, exercise_id: 2, superset_group: "A", round_rest_seconds: 90 }),
  ]);

  // Assert — the lettered badge is derived for display; the record model is untouched
  assert.equal(groups[0].superset.memberLabel, "A");
  assert.equal(groups[1].superset.memberLabel, "B");
});

test("shows at least one row for a malformed zero-set prescription", () => {
  assert.equal(prescribedRowCount(prescription({ sets: 0 })), 1);
  assert.equal(buildLogForm([prescription({ sets: 0 })])[0].rows.length, 1);
});

test("seededReps keeps integers and drops non-numeric prescriptions", () => {
  assert.equal(seededReps("5"), "5");
  assert.equal(seededReps(" 12 "), "12");
  assert.equal(seededReps("8-12"), "");
  assert.equal(seededReps("AMRAP"), "");
});

test("derives Completed when every prescribed set is attempted", () => {
  // Arrange — a 3-set prescription, all three Done
  const groups = buildLogForm([prescription({ sets: 3 })]);
  const rows = groups.flatMap((group) => group.rows);

  // Act / Assert
  const outcome = deriveCompletionOutcome(prescribedByPosition(groups), rows);
  assert.equal(outcome, "completed");
  assert.equal(skippedSetCount(prescribedByPosition(groups), rows), 0);
});

test("derives Incomplete when a prescribed set is left un-attempted", () => {
  // Arrange — a 3-set prescription with the last set unchecked (skipped)
  const groups = buildLogForm([prescription({ sets: 3 })]);
  const prescribed = prescribedByPosition(groups);
  const rows = groups.flatMap((group) =>
    group.rows.map((row, index) => ({ ...row, done: index !== 2 })),
  );

  // Act / Assert — one prescribed set un-attempted → Incomplete, and it is counted
  assert.equal(deriveCompletionOutcome(prescribed, rows), "incomplete");
  assert.equal(skippedSetCount(prescribed, rows), 1);
});

test("extra Done sets beyond the prescription never make it Incomplete", () => {
  // Arrange — a 2-set prescription with a third (extra) Done set added
  const groups = buildLogForm([prescription({ sets: 2 })]);
  const prescribed = prescribedByPosition(groups);
  const rows = [
    ...groups[0].rows,
    { ...groups[0].rows[0], key: "extra", setNumber: 3 },
  ];

  // Act / Assert — bonus attempted work, still Completed
  assert.equal(deriveCompletionOutcome(prescribed, rows), "completed");
  assert.equal(skippedSetCount(prescribed, rows), 0);
});

test("counts a whole skipped exercise's prescribed sets as un-attempted", () => {
  // Arrange — two exercises; the second is entirely unchecked
  const groups = buildLogForm([
    prescription({ position: 0, exercise_id: 1, sets: 2 }),
    prescription({ position: 1, exercise_id: 2, sets: 3 }),
  ]);
  const prescribed = prescribedByPosition(groups);
  const rows = groups.flatMap((group) =>
    group.rows.map((row) => ({ ...row, done: group.position === 0 })),
  );

  // Act / Assert — three prescribed sets left un-attempted
  assert.equal(deriveCompletionOutcome(prescribed, rows), "incomplete");
  assert.equal(skippedSetCount(prescribed, rows), 3);
});

// --- Kind-aware seeding (ADR-0050, issue #343): buildLogForm reads the typed Prescribed
// Quantity and seeds each row with the matching kind/value/unit, so a reused run lands on a
// distance field pre-filled with the prescribed distance.

const distanceQuantity: Quantity = { kind: "distance", text: "7 KM", metres: 7000 };
const durationQuantity: Quantity = { kind: "duration", text: "45s", seconds: 45 };

test("seeds a distance row with the prescribed value, unit, and blank companion time", () => {
  // Arrange — a "1 × 7 KM" running prescription
  const [group] = buildLogForm([
    prescription({ sets: 1, reps: "7 KM", prescribed_quantity: distanceQuantity }),
  ]);

  // Assert — the row is a distance kind, the field pre-filled with 7 km, no time yet
  assert.equal(group.kind, "distance");
  assert.equal(group.rows[0].kind, "distance");
  assert.equal(group.rows[0].distance, "7");
  assert.equal(group.rows[0].unit, "km");
  assert.equal(group.rows[0].duration, "");
  assert.equal(group.rows[0].reps, "");
});

test("seeds a miles distance value from canonical metres without float noise", () => {
  // Arrange — 3.1 miles prescribed, stored canonically in metres
  const milesQuantity: Quantity = {
    kind: "distance",
    text: "3.1 mi",
    metres: 3.1 * 1609.344,
  };
  const [group] = buildLogForm([
    prescription({ sets: 1, reps: "3.1 mi", prescribed_quantity: milesQuantity }),
  ]);

  // Assert — reads back as "3.1 mi", not "3.0999…"
  assert.equal(group.rows[0].distance, "3.1");
  assert.equal(group.rows[0].unit, "mi");
});

test("seeds a duration row's hold time from canonical seconds", () => {
  // Arrange — a 45-second plank hold prescribed
  const [group] = buildLogForm([
    prescription({ sets: 1, reps: "45s", prescribed_quantity: durationQuantity }),
  ]);

  // Assert — a duration kind seeded with the hold time in mm:ss (matching the field's
  // placeholder); the verbatim "45s" stays the hint
  assert.equal(group.kind, "duration");
  assert.equal(group.rows[0].kind, "duration");
  assert.equal(group.rows[0].duration, "0:45");
  assert.equal(group.hint, "45s");
});

test("seeds a minutes-long hold as mm:ss (90s → 1:30)", () => {
  const [group] = buildLogForm([
    prescription({
      sets: 1,
      reps: "1:30",
      prescribed_quantity: { kind: "duration", text: "1:30", seconds: 90 },
    }),
  ]);
  assert.equal(group.rows[0].duration, "1:30");
});

test("leaves a repetitions prescription unchanged when no typed Quantity is present", () => {
  // Arrange — a legacy/strength prescription with no prescribed_quantity
  const [group] = buildLogForm([prescription({ sets: 1, reps: "8" })]);

  // Assert — reps kind, reps seeded as before, distance/duration empty
  assert.equal(group.kind, "repetitions");
  assert.equal(group.rows[0].reps, "8");
  assert.equal(group.rows[0].distance, "");
  assert.equal(group.rows[0].duration, "");
});

test("hides the Load block by default for distance/duration but keeps it for reps", () => {
  const groups = buildLogForm([
    prescription({ position: 0, sets: 1, reps: "7 KM", prescribed_quantity: distanceQuantity }),
    prescription({ position: 1, sets: 1, reps: "45s", prescribed_quantity: durationQuantity }),
    prescription({ position: 2, sets: 1, reps: "8" }),
  ]);

  assert.equal(groups[0].rows[0].showLoad, false);
  assert.equal(groups[1].rows[0].showLoad, false);
  assert.equal(groups[2].rows[0].showLoad, true);
});

test("keeps the Load block for a loaded carry — a distance set with a prescribed load", () => {
  // Arrange — a weighted-carry run: distance kind, but a load is explicitly prescribed
  const [group] = buildLogForm([
    prescription({
      sets: 1,
      reps: "1 KM",
      prescribed_quantity: { kind: "distance", text: "1 KM", metres: 1000 },
      recommended_load: { kind: "absolute", text: "20kg", kg: 20 },
    }),
  ]);

  // Assert — Load stays visible and seeded, since the plan asked for it
  assert.equal(group.rows[0].showLoad, true);
  assert.equal(group.rows[0].loadKind, "absolute");
  assert.equal(group.rows[0].loadValue, "20");
});

// --- Per-set payload building (ADR-0050): buildLogSet/buildLoggedSets dispatch by kind to the
// shared quantity request builders, the same seam hand-authored-session tests cover.

function row(overrides: Partial<LogRowFields> = {}): LogRowFields {
  return {
    exerciseId: 1,
    kind: "repetitions",
    reps: "",
    distance: "",
    unit: "km",
    duration: "",
    loadKind: "absolute",
    loadValue: "",
    rpe: "",
    ...overrides,
  };
}

test("a repetitions row logs its reps as a repetitions Quantity", () => {
  const result = buildLogSet(row({ reps: "8", loadValue: "60" }));
  assert.equal(result.status, "set");
  if (result.status !== "set") return;
  assert.equal(result.set.quantity_kind, "repetitions");
  assert.equal(result.set.quantity_value, "8");
  assert.equal(result.set.load_value, "60");
  assert.equal(result.set.quantity_unit, undefined);
});

test("a blank Done reps row logs as 0 reps, not a skip (regression: attempted to failure)", () => {
  const result = buildLogSet(row({ reps: "" }));
  assert.equal(result.status, "set");
  if (result.status !== "set") return;
  assert.equal(result.set.quantity_value, "0");
});

test("a malformed reps value is dropped silently", () => {
  assert.equal(buildLogSet(row({ reps: "-3" })).status, "skip");
  assert.equal(buildLogSet(row({ reps: "5.5" })).status, "skip");
});

test("a distance row logs a distance Quantity with unit and optional companion time", () => {
  const result = buildLogSet(
    row({ kind: "distance", distance: "6.8", unit: "km", duration: "30:00" }),
  );
  assert.equal(result.status, "set");
  if (result.status !== "set") return;
  assert.equal(result.set.quantity_kind, "distance");
  assert.equal(result.set.quantity_value, "6.8");
  assert.equal(result.set.quantity_unit, "km");
  assert.equal(result.set.quantity_duration, "30:00");
});

test("a distance-only run (no time) logs fine and sends no companion time", () => {
  const result = buildLogSet(row({ kind: "distance", distance: "7", unit: "km", duration: "" }));
  assert.equal(result.status, "set");
  if (result.status !== "set") return;
  assert.equal(result.set.quantity_value, "7");
  assert.equal(result.set.quantity_duration, null);
});

test("a garbled distance is rejected with a clear message, but a blank one is skipped", () => {
  // Garbled (the user typed nonsense) → reject the whole submission with a clear message
  const garbled = buildLogSet(row({ kind: "distance", distance: "abc" }));
  assert.equal(garbled.status, "error");
  if (garbled.status === "error") assert.match(garbled.error, /valid distance/);
  assert.equal(buildLogSet(row({ kind: "distance", distance: "0" })).status, "error");
  assert.equal(buildLogSet(row({ kind: "distance", distance: "-3" })).status, "error");

  // Blank → not performed → skip, so an added-but-unfilled distance row never blocks the log
  assert.equal(buildLogSet(row({ kind: "distance", distance: "" })).status, "skip");
});

test("a duration row logs a duration Quantity; a garbled time errors, a blank one skips", () => {
  const ok = buildLogSet(row({ kind: "duration", duration: "1:30" }));
  assert.equal(ok.status, "set");
  if (ok.status === "set") {
    assert.equal(ok.set.quantity_kind, "duration");
    assert.equal(ok.set.quantity_value, "1:30");
  }

  const garbled = buildLogSet(row({ kind: "duration", duration: "nope" }));
  assert.equal(garbled.status, "error");
  if (garbled.status === "error") assert.match(garbled.error, /valid hold time/);

  // Blank → not performed → skip
  assert.equal(buildLogSet(row({ kind: "duration", duration: "" })).status, "skip");
});

test("Load is omitted (null) by default for a distance set and passed through when present", () => {
  const noLoad = buildLogSet(row({ kind: "distance", distance: "5" }));
  assert.equal(noLoad.status, "set");
  if (noLoad.status === "set") assert.equal(noLoad.set.load_value, null);

  const carried = buildLogSet(
    row({ kind: "distance", distance: "5", loadKind: "absolute", loadValue: "20" }),
  );
  assert.equal(carried.status, "set");
  if (carried.status === "set") {
    assert.equal(carried.set.load_kind, "absolute");
    assert.equal(carried.set.load_value, "20");
  }
});

test("buildLoggedSets rejects the whole submission on the first malformed distance", () => {
  const rows: LogRowFields[] = [
    row({ reps: "8" }),
    row({ kind: "distance", distance: "nope" }),
  ];
  const built = buildLoggedSets(rows);
  assert.equal(built.ok, false);
  if (!built.ok) assert.match(built.error, /valid distance/);
});

test("buildLoggedSets builds a hybrid run-then-squats Session, dropping skipped-only rows", () => {
  const rows: LogRowFields[] = [
    row({ exerciseId: 1, kind: "distance", distance: "5", unit: "km" }),
    row({ exerciseId: 2, kind: "repetitions", reps: "10" }),
  ];
  const built = buildLoggedSets(rows);
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.sets.length, 2);
  assert.equal(built.sets[0].quantity_kind, "distance");
  assert.equal(built.sets[1].quantity_kind, "repetitions");
});

// --- Form-row reading (indexed fields): readLogFormRows drops un-done rows and reads each
// row's kind-specific fields by index, so a heterogeneous submission never misaligns.

test("readLogFormRows reads indexed rows and drops the ones not marked done", () => {
  const form = new FormData();
  form.set("set_count", "2");
  form.set("set-0-done", "true");
  form.set("set-0-exercise_id", "1");
  form.set("set-0-kind", "distance");
  form.set("set-0-distance", "5");
  form.set("set-0-unit", "km");
  // Row 1 was skipped (not done) — it must not reach the payload
  form.set("set-1-done", "false");
  form.set("set-1-exercise_id", "2");
  form.set("set-1-kind", "repetitions");
  form.set("set-1-reps", "10");

  const rows = readLogFormRows(form);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].exerciseId, 1);
  assert.equal(rows[0].kind, "distance");
  assert.equal(rows[0].distance, "5");
});

test("readLogFormRows clamps a forged oversized set_count to a bounded number of rows", () => {
  // Arrange — a hostile submission claiming an absurd row count, with a Done row well past
  // the ceiling. The reader must bound its loop rather than walk billions of indices.
  const form = new FormData();
  form.set("set_count", "1000000000");
  form.set("set-0-done", "true");
  form.set("set-0-exercise_id", "1");
  form.set("set-0-kind", "repetitions");
  form.set("set-0-reps", "5");
  // A row beyond the cap (index 600 > 500) is never read.
  form.set("set-600-done", "true");
  form.set("set-600-exercise_id", "2");
  form.set("set-600-kind", "repetitions");
  form.set("set-600-reps", "8");

  const rows = readLogFormRows(form);
  // Only the in-bounds Done row is returned; the loop stopped at the ceiling.
  assert.equal(rows.length, 1);
  assert.equal(rows[0].exerciseId, 1);
});

// --- Pin offer + dialog (ADR-0053, #368/#371): after a bodyweight log where every working
// set beat the top of the prescribed rep range, the log view-model offers a confirm dialog to
// Pin a new rep target, pre-filled and editable, paired with the harder-Variation alternative.
// This mirrors the domain `pin_offer` rule (app/domain/progression.py, #370) on the data the
// form already holds; the tests pin the offer/no-offer decision, the pre-fill + edit, and the
// harder-Variation alternative.

const BODYWEIGHT: Load = { kind: "bodyweight", text: "Bodyweight" };
const WEIGHTED_BODYWEIGHT: Load = { kind: "bodyweight", text: "+10kg", added_kg: 10 };
const ABSOLUTE: Load = { kind: "absolute", text: "60kg", kg: 60 };

test("parseRepTarget reads a single number, a range, and rejects free text", () => {
  assert.deepEqual(parseRepTarget("5"), { floor: 5, ceiling: 5 });
  assert.deepEqual(parseRepTarget("8-12"), { floor: 8, ceiling: 12 });
  assert.deepEqual(parseRepTarget("  10 - 14 "), { floor: 10, ceiling: 14 });
  assert.equal(parseRepTarget("AMRAP"), null);
  assert.equal(parseRepTarget(""), null);
});

test("pinOffer is offered for a pure-bodyweight movement beaten on every set", () => {
  // Arrange — a pure-bodyweight "8-12" prescription, every working set above the ceiling
  const proposal = pinOffer(
    { reps: "8-12", recommended_load: BODYWEIGHT },
    [13, 14, 15],
  );

  // Assert — offered, with the range kept in the prescription's shape (floor..max performed)
  assert.notEqual(proposal, null);
  assert.equal(proposal?.proposedReps, "13-15");
});

test("pinOffer keeps a single-number target single, derived from the min reps performed", () => {
  const proposal = pinOffer(
    { reps: "5", recommended_load: BODYWEIGHT },
    [7, 8, 9],
  );
  assert.equal(proposal?.proposedReps, "7");
});

test("pinOffer is withheld when a set only meets the ceiling (not strictly above)", () => {
  // One set lands exactly on the ceiling of 12 → "more than the plan" is not unambiguous
  assert.equal(
    pinOffer({ reps: "8-12", recommended_load: BODYWEIGHT }, [13, 12, 14]),
    null,
  );
});

test("pinOffer is withheld for a met-floor-only session", () => {
  // Every set at the floor, none above the ceiling
  assert.equal(
    pinOffer({ reps: "8-12", recommended_load: BODYWEIGHT }, [8, 9, 10]),
    null,
  );
});

test("pinOffer is withheld for a non-bodyweight (loaded) movement", () => {
  // Load is the progression axis here, not reps — never offered a rep Pin
  assert.equal(
    pinOffer({ reps: "8-12", recommended_load: ABSOLUTE }, [13, 14, 15]),
    null,
  );
});

test("pinOffer is withheld for a weighted-bodyweight (added-load) movement", () => {
  // Added load is the axis for a weighted bodyweight movement, so no rep Pin
  assert.equal(
    pinOffer({ reps: "8-12", recommended_load: WEIGHTED_BODYWEIGHT }, [13, 14, 15]),
    null,
  );
});

test("pinOffer is withheld when the prescription carries no load or free-text reps", () => {
  assert.equal(pinOffer({ reps: "8-12", recommended_load: null }, [13, 14]), null);
  assert.equal(
    pinOffer({ reps: "AMRAP", recommended_load: BODYWEIGHT }, [13, 14]),
    null,
  );
});

test("pinOffer is withheld with no working sets, or a set with no rep count", () => {
  // No sets → nothing to judge
  assert.equal(pinOffer({ reps: "8-12", recommended_load: BODYWEIGHT }, []), null);
  // A set with no rep count (a hold/run, or a garbled entry) holds the offer back
  assert.equal(
    pinOffer({ reps: "8-12", recommended_load: BODYWEIGHT }, [13, null, 14]),
    null,
  );
});

test("performedRepsForGroup reads the Done rows' reps and ignores skipped rows and effort", () => {
  // Arrange — a pure-bodyweight group; set the reps and mark one row skipped, all with high RPE
  const [group] = buildLogForm([
    prescription({ sets: 3, reps: "8-12", recommended_load: BODYWEIGHT }),
  ]);
  const rows = group.rows.map((row, index) => ({
    ...row,
    reps: String(13 + index),
    rpe: "10",
    done: index !== 2,
  }));
  const withRows: LogPrescriptionGroup = { ...group, rows };

  // Assert — only the two Done rows' reps, effort ignored entirely
  assert.deepEqual(performedRepsForGroup(withRows), [13, 14]);
});

test("performedRepsForGroup maps a blank Done reps set to 0 and a non-rep set to null", () => {
  const blank: LogSetRow = {
    key: "k",
    prescriptionPosition: 0,
    exerciseId: 1,
    setNumber: 1,
    kind: "repetitions",
    reps: "",
    distance: "",
    unit: "km",
    duration: "",
    loadKind: "bodyweight",
    loadValue: "",
    showLoad: true,
    rpe: "",
    done: true,
  };
  const hold: LogSetRow = { ...blank, key: "h", kind: "duration", duration: "0:45" };
  // performedRepsForGroup reads only the rows, so a `{ rows }` slice is all it needs.
  assert.deepEqual(performedRepsForGroup({ rows: [blank, hold] }), [0, null]);
});

test("normalizePinTarget accepts a sane range/single and rejects a nonsensical one", () => {
  assert.equal(normalizePinTarget("12"), "12");
  assert.equal(normalizePinTarget("10-14"), "10-14");
  assert.equal(normalizePinTarget("  10 - 14 "), "10-14");
  assert.equal(normalizePinTarget("5-5"), "5");
  // Reversed range, zero/negative bound, or free text → not a valid Pinned Target
  assert.equal(normalizePinTarget("14-10"), null);
  assert.equal(normalizePinTarget("0"), null);
  assert.equal(normalizePinTarget("0-5"), null);
  assert.equal(normalizePinTarget("AMRAP"), null);
});

test("buildPinDialog returns null for a movement that does not qualify", () => {
  const dialog = buildPinDialog({
    prescription: prescription({ reps: "8-12", recommended_load: ABSOLUTE }),
    performedReps: [13, 14, 15],
  });
  assert.equal(dialog, null);
});

test("buildPinDialog pre-fills the proposed range and names the movement", () => {
  const dialog = buildPinDialog({
    prescription: prescription({
      position: 2,
      reps: "8-12",
      recommended_load: BODYWEIGHT,
      exercise_name: "Pull-up",
    }),
    performedReps: [13, 14, 15],
  });

  assert.notEqual(dialog, null);
  assert.equal(dialog?.position, 2);
  assert.equal(dialog?.proposedReps, "13-15");
  assert.match(dialog?.exerciseName ?? "", /Pull-up/);
  assert.match(dialog?.title ?? "", /Pull-up/);
});

test("buildPinDialog pairs the harder-Variation alternative when one is on file", () => {
  const dialog = buildPinDialog({
    prescription: prescription({ reps: "8-12", recommended_load: BODYWEIGHT }),
    performedReps: [13, 14, 15],
    harderVariation: { exercise_id: 42, name: "Archer Pull-up" },
  });

  assert.equal(dialog?.harderVariation.kind, "offer");
  if (dialog?.harderVariation.kind === "offer") {
    assert.equal(dialog.harderVariation.exerciseId, 42);
    assert.match(dialog.harderVariation.acceptLabel, /Archer Pull-up/);
  }
});

test("buildPinDialog shows no harder-Variation alternative when none is on file", () => {
  const dialog = buildPinDialog({
    prescription: prescription({ reps: "8-12", recommended_load: BODYWEIGHT }),
    performedReps: [13, 14, 15],
    harderVariation: null,
  });
  assert.equal(dialog?.harderVariation.kind, "none");
});

test("collectPinCandidates finds the qualifying movement among several logged", () => {
  // Arrange — a bodyweight movement beaten on every set, and a loaded one that never qualifies
  const prescriptions = [
    prescription({ position: 0, exercise_id: 1, sets: 2, reps: "8-12", recommended_load: BODYWEIGHT, exercise_name: "Pull-up" }),
    prescription({ position: 1, exercise_id: 2, sets: 2, reps: "8-12", recommended_load: ABSOLUTE, exercise_name: "Row" }),
  ];
  const groups = buildLogForm(prescriptions).map((group) => ({
    ...group,
    rows: group.rows.map((row) => ({ ...row, reps: "15" })),
  }));

  const candidates = collectPinCandidates(prescriptions, groups);

  // Assert — only the bodyweight movement qualifies, carrying its numeric performed reps
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].prescription.position, 0);
  assert.deepEqual(candidates[0].performedReps, [15, 15]);
});
