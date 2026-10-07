import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildLoggedSets,
  carriedEffortValue,
  hasAmount,
  readPostedSetRows,
  type LoggedSetRow,
} from "./logged-set.ts";
import { setEntryValues, type SetEntryValues } from "./set-entry.ts";

// `logged-set` is the one place a performed-set row becomes a `LogSetInput` (ADR-0115). Every
// logging path — the plan-backed log, the ad-hoc log, Log Correction, the Hand-Authored
// Session, and the Live Session finish — builds through it, so the skip-versus-error policy,
// the typed Effort, the note and the kg conversion are pinned here once.

function row(
  values: Partial<SetEntryValues>,
  extra: Partial<LoggedSetRow> = {},
): LoggedSetRow {
  return { exerciseId: 7, values: setEntryValues(values), ...extra };
}

function only(rows: LoggedSetRow[], options = {}) {
  const built = buildLoggedSets(rows, "kg", options);
  assert.equal(built.ok, true, built.ok ? "" : built.error);
  return built.ok ? built.sets : [];
}

function errorOf(rows: LoggedSetRow[], options = {}): string {
  const built = buildLoggedSets(rows, "kg", options);
  assert.equal(built.ok, false);
  return built.ok ? "" : built.error;
}

// --- Quantity: blank skips, garbage errors, on every kind.

test("a repetitions row logs its reps as a repetitions Quantity", () => {
  const [set] = only([row({ reps: "8" })]);
  assert.equal(set.exercise_id, 7);
  assert.equal(set.quantity_kind, "repetitions");
  assert.equal(set.quantity_value, "8");
});

test("a blank kind reads as repetitions", () => {
  const [set] = only([row({ kind: "", reps: "5" })]);
  assert.equal(set.quantity_kind, "repetitions");
});

test("a blank reps row is skipped when the path has no performed mark", () => {
  assert.deepEqual(only([row({ reps: "  " })]), []);
});

test("a blank reps row on a path with a performed mark logs as 0 reps", () => {
  const [set] = only([row({ reps: "" })], { performedMark: true });
  assert.equal(set.quantity_value, "0");
});

test("a garbled rep count is an error, not a silent drop", () => {
  for (const reps of ["-3", "5.5", "abc"]) {
    assert.match(errorOf([row({ reps })]), /whole number of reps/);
  }
});

test("a distance row logs value, unit and optional companion time", () => {
  const [set] = only([row({ kind: "distance", distance: "5", unit: "mi", duration: "25:00" })]);
  assert.equal(set.quantity_kind, "distance");
  assert.equal(set.quantity_value, "5");
  assert.equal(set.quantity_unit, "mi");
  assert.equal(set.quantity_duration, "25:00");
});

test("a distance row with no unit falls back to km", () => {
  const [set] = only([row({ kind: "distance", distance: "3" })]);
  assert.equal(set.quantity_unit, "km");
});

test("a blank distance skips the row; a garbled or non-positive one is an error", () => {
  assert.deepEqual(only([row({ kind: "distance", distance: "" })]), []);
  for (const distance of ["abc", "0", "-2"]) {
    assert.match(errorOf([row({ kind: "distance", distance })]), /valid distance/);
  }
});

test("a blank duration skips the row; a garbled or zero one is an error", () => {
  const [set] = only([row({ kind: "duration", duration: "1:30" })]);
  assert.equal(set.quantity_kind, "duration");
  assert.equal(set.quantity_value, "1:30");

  assert.deepEqual(only([row({ kind: "duration", duration: " " })]), []);
  for (const duration of ["nope", "0", "1::2"]) {
    assert.match(errorOf([row({ kind: "duration", duration })]), /valid hold time/);
  }
});

test("a performed mark never turns a blank distance or duration into a set", () => {
  const options = { performedMark: true };
  assert.deepEqual(only([row({ kind: "distance", distance: "" })], options), []);
  assert.deepEqual(only([row({ kind: "duration", duration: "" })], options), []);
});

test("the first error rejects the whole list so nothing partial is saved", () => {
  const built = buildLoggedSets(
    [row({ reps: "8" }), row({ kind: "distance", distance: "x" }), row({ reps: "5" })],
    "kg",
  );
  assert.equal(built.ok, false);
});

test("a row with a non-integer exercise id is skipped", () => {
  assert.deepEqual(only([{ exerciseId: Number.NaN, values: setEntryValues({ reps: "8" }) }]), []);
});

// --- Load: typed kind, kg conversion, defaults.

test("a load value is stored as canonical kilograms from the reader's unit", () => {
  const built = buildLoggedSets(
    [row({ reps: "5", load_kind: "absolute", load_value: "100" })],
    "lb",
  );
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.sets[0].load_kind, "absolute");
  assert.equal(built.sets[0].load_value, "45.359237");
});

test("a blank load value records no load", () => {
  const [set] = only([row({ reps: "5", load_kind: "absolute", load_value: " " })]);
  assert.equal(set.load_value, null);
});

test("a blank load kind falls back to absolute, or to the path's default", () => {
  assert.equal(only([row({ reps: "5" })])[0].load_kind, "absolute");
  assert.equal(
    only([row({ kind: "duration", duration: "45" })], { defaultLoadKind: "bodyweight" })[0]
      .load_kind,
    "bodyweight",
  );
});

test("a picked load kind wins over the path's default", () => {
  const [set] = only([row({ reps: "5", load_kind: "percent_1rm", load_value: "75" })], {
    defaultLoadKind: "bodyweight",
  });
  assert.equal(set.load_kind, "percent_1rm");
  assert.equal(set.load_value, "75");
});

// --- Effort: typed whenever present (ADR-0066).

test("an in-range RPE is sent as a typed RPE Effort and as perceived difficulty", () => {
  const [set] = only([row({ reps: "5", rpe: "8" })]);
  assert.equal(set.perceived_difficulty, 8);
  assert.equal(set.effort_scale, "rpe");
  assert.equal(set.effort_value, 8);
});

test("a blank or out-of-range RPE sends no Effort at all", () => {
  for (const rpe of ["", "0", "11", "7.5", "hard"]) {
    const [set] = only([row({ reps: "5", rpe })]);
    assert.equal(set.perceived_difficulty, null);
    assert.equal("effort_scale" in set, false);
    assert.equal("effort_value" in set, false);
  }
});

test("a carried Effort is re-sent unchanged when its cell was not edited", () => {
  const carriedEffort = { effort: { scale: "rir" as const, value: 2 }, shownAs: "8" };
  const [set] = only([row({ reps: "5", rpe: "8" }, { carriedEffort })]);
  assert.equal(set.effort_scale, "rir");
  assert.equal(set.effort_value, 2);
});

test("an edited cell replaces the carried Effort with the new RPE", () => {
  const carriedEffort = { effort: { scale: "rir" as const, value: 2 }, shownAs: "8" };
  const [set] = only([row({ reps: "5", rpe: "6" }, { carriedEffort })]);
  assert.equal(set.effort_scale, "rpe");
  assert.equal(set.effort_value, 6);
  assert.equal(set.perceived_difficulty, 6);
});

test("clearing the cell of a carried Effort removes the Effort", () => {
  const carriedEffort = { effort: { scale: "rpe" as const, value: 7.5 }, shownAs: "8" };
  const [set] = only([row({ reps: "5", rpe: "" }, { carriedEffort })]);
  assert.equal(set.perceived_difficulty, null);
  assert.equal("effort_scale" in set, false);
});

// --- Set Note.

test("a note rides trimmed; a blank one is omitted", () => {
  assert.equal(only([row({ reps: "5", note: "  left knee  " })])[0].note, "left knee");
  assert.equal("note" in only([row({ reps: "5", note: "   " })])[0], false);
});

// --- Reading a posted form.

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

test("readPostedSetRows reads every entry field, the exercise id and the done mark", () => {
  const rows = readPostedSetRows(
    form({
      set_count: "2",
      "set-0-exercise_id": "4",
      "set-0-kind": "distance",
      "set-0-distance": "5",
      "set-0-unit": "mi",
      "set-0-done": "true",
      "set-0-note": "windy",
      "set-1-movement": "Plank",
      "set-1-kind": "duration",
      "set-1-duration": "45",
    }),
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].exerciseId, 4);
  assert.equal(rows[0].done, true);
  assert.equal(rows[0].values.distance, "5");
  assert.equal(rows[0].values.unit, "mi");
  assert.equal(rows[0].values.note, "windy");
  assert.equal(rows[1].exerciseId, null);
  assert.equal(rows[1].done, null);
  assert.equal(rows[1].values.movement, "Plank");
  assert.equal(rows[1].values.duration, "45");
});

test("readPostedSetRows reads a false done mark and a garbled id as absent", () => {
  const [posted] = readPostedSetRows(
    form({ set_count: "1", "set-0-exercise_id": "x", "set-0-done": "false" }),
  );
  assert.equal(posted.done, false);
  assert.equal(posted.exerciseId, null);
});

test("readPostedSetRows returns nothing for a missing or invalid set_count", () => {
  assert.deepEqual(readPostedSetRows(form({})), []);
  assert.deepEqual(readPostedSetRows(form({ set_count: "-1" })), []);
  assert.deepEqual(readPostedSetRows(form({ set_count: "abc" })), []);
});

test("readPostedSetRows clamps a forged oversized set_count", () => {
  const rows = readPostedSetRows(form({ set_count: "100000000" }));
  assert.equal(rows.length, 500);
});

test("a carried Effort round-trips through its hidden field", () => {
  const carried = { effort: { scale: "rir" as const, value: 2 }, shownAs: "8" };
  const [posted] = readPostedSetRows(
    form({ set_count: "1", "set-0-carried_effort": carriedEffortValue(carried) }),
  );
  assert.deepEqual(posted.carriedEffort, carried);
});

test("a forged or malformed carried Effort reads as none", () => {
  for (const value of ["", "{", '{"scale":"borg","value":2,"shownAs":"8"}', '{"scale":"rpe"}']) {
    const [posted] = readPostedSetRows(form({ set_count: "1", "set-0-carried_effort": value }));
    assert.equal(posted.carriedEffort, null);
  }
});

test("hasAmount reads the field the row's kind names", () => {
  assert.equal(hasAmount(setEntryValues({ reps: "3" })), true);
  assert.equal(hasAmount(setEntryValues({ reps: " " })), false);
  assert.equal(hasAmount(setEntryValues({ kind: "distance", reps: "3" })), false);
  assert.equal(hasAmount(setEntryValues({ kind: "duration", duration: "45" })), true);
});
