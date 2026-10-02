import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SET_ENTRY_FIELDS,
  SET_ENTRY_LABELS,
  rowToSetEntryValues,
  seededSetEntryValues,
  setEntryLabel,
  setEntryName,
  setEntryPatchToRow,
  setEntryPrefix,
  setEntryValueBinding,
  setEntryValues,
  type SetEntryField,
  type SetEntryRowMap,
} from "./set-entry.ts";

// The four log forms wrote the same amount/load entry UI four times (composition audit #2), and
// the copies had already drifted: two of the five Load fields asked for no keypad, and one
// distance field was not a `type="number"` at all. This module is the one vocabulary they now
// share — a field's submitted name, its accessible name, and which of React's two value props
// it takes — so the next drift has nowhere to happen.

test("every field in the vocabulary gets a blank default", () => {
  // Arrange / Act — the record a caller gets when it supplies nothing.
  const values = setEntryValues({});

  // Assert — exactly the vocabulary, every entry a string. A field added to
  // SET_ENTRY_FIELDS without a default would render `value={undefined}`, which React reads
  // as an *uncontrolled* input: every keystroke in it would be silently discarded.
  assert.deepEqual(Object.keys(values).sort(), [...SET_ENTRY_FIELDS].sort());
  for (const field of SET_ENTRY_FIELDS) assert.equal(typeof values[field], "string");
});

test("supplied values survive and the rest stay blank", () => {
  // Arrange / Act
  const values = setEntryValues({ reps: "8", load_kind: "absolute", load_value: "60" });

  // Assert
  assert.equal(values.reps, "8");
  assert.equal(values.load_kind, "absolute");
  assert.equal(values.load_value, "60");
  assert.equal(values.duration, "");
  assert.equal(values.note, "");
});

test("every field carries a caption, so no part renders an unlabelled control", () => {
  // Assert — the captions are the visible micro-labels; a missing one is an unnamed field.
  for (const field of SET_ENTRY_FIELDS) {
    assert.equal(typeof SET_ENTRY_LABELS[field], "string", `${field} has a caption`);
    assert.notEqual(SET_ENTRY_LABELS[field], "");
  }
});

test("a field's submitted name is its row prefix and its own vocabulary word", () => {
  // Assert — the indexed shape every form's parser reads (`readAdhocFormRows` and friends
  // walk `set-<i>-<field>` for i in 0…set_count-1), so the vocabulary *is* the wire contract.
  assert.equal(setEntryPrefix(0), "set-0");
  assert.equal(setEntryPrefix(11), "set-11");
  assert.equal(setEntryName("set-3", "load_kind"), "set-3-load_kind");
  assert.equal(setEntryName("set-3", "load_value"), "set-3-load_value");
  assert.equal(setEntryName("set-0", "duration"), "set-0-duration");
});

test("a row that never posts submits no name at all", () => {
  // The Live Session is ephemeral and client-side until it is finished (ADR-0012): its set
  // rows are in no form, so a `name` on them would be a promise nothing collects.
  assert.equal(setEntryName(null, "reps"), undefined);
  assert.equal(setEntryName(null, "load_value"), undefined);
});

test("an accessible name joins the caption to whatever the row is about", () => {
  // The four forms address a row two ways and both have to survive, because each reads
  // correctly where it is used: a named movement takes "for", an ordinal takes a comma.
  assert.equal(
    setEntryLabel({ joiner: "for", name: "Back Squat" }, "Distance"),
    "Distance for Back Squat",
  );
  assert.equal(
    setEntryLabel({ joiner: "for", name: "set 2" }, "Load kind"),
    "Load kind for set 2",
  );
  assert.equal(
    setEntryLabel({ joiner: "comma", name: "set 1" }, "Movement name"),
    "Movement name, set 1",
  );
  assert.equal(
    setEntryLabel({ joiner: "comma", name: "added set 3" }, "Reps"),
    "Reps, added set 3",
  );
});

test("a controlled binding takes value and an uncontrolled one takes defaultValue", () => {
  // The axis the audit named: `value`/`onChange` against `defaultValue` is the *only* real
  // difference between the controlled forms and the server-action ones. Resolving it here
  // once is what lets a field component stay blind to which kind of form it is inside.
  assert.deepEqual(setEntryValueBinding("controlled", "60"), { value: "60" });
  assert.deepEqual(setEntryValueBinding("uncontrolled", "60"), { defaultValue: "60" });
});

test("a binding names only the prop it means, never the other as undefined", () => {
  // React decides an input is controlled by whether `value` is nullish, so a binding that
  // carried `value: undefined` beside a `defaultValue` would read as uncontrolled — and one
  // carrying `defaultValue: undefined` beside a `value` warns. Only one key may be present.
  assert.deepEqual(Object.keys(setEntryValueBinding("controlled", "")), ["value"]);
  assert.deepEqual(Object.keys(setEntryValueBinding("uncontrolled", "")), ["defaultValue"]);
});

test("a blank controlled binding still holds the field controlled", () => {
  // The empty string is the common case — an un-entered Load — and it must stay `value: ""`
  // rather than becoming absent, or the field flips to uncontrolled the moment it is cleared.
  const binding = setEntryValueBinding("controlled", "");
  assert.deepEqual(binding, { value: "" });
});

// A stand-in for the `camelCase` row shapes the forms actually hold — a persisted ad-hoc draft,
// or the prescription-seeded log row a `lib/` view-model builds — neither of which can simply
// adopt the wire vocabulary as its own field names.
interface Row {
  reps: string;
  loadKind: string;
  loadValue: string;
  note: string;
}

const ROW_MAP: SetEntryRowMap<Row> = {
  reps: "reps",
  load_kind: "loadKind",
  load_value: "loadValue",
  note: "note",
};

test("one table maps a form's row both ways", () => {
  // The table is the point: two hand-written mappers can drift apart — a field added to one
  // direction and forgotten in the other silently discards that field's edits, which is the
  // same class of bug the whole set-entry family exists to end.
  const row: Row = { reps: "8", loadKind: "absolute", loadValue: "60", note: "felt easy" };

  // Act
  const values = rowToSetEntryValues(row, ROW_MAP);

  // Assert — the mapped fields carry over and the unmapped ones read blank, not absent.
  assert.equal(values.reps, "8");
  assert.equal(values.load_kind, "absolute");
  assert.equal(values.load_value, "60");
  assert.equal(values.note, "felt easy");
  assert.equal(values.distance, "");
  assert.equal(values.movement, "");
});

test("a patch comes back under the row's own spelling", () => {
  // Act
  const patch = setEntryPatchToRow<Row>({ load_kind: "range", load_value: "60-70" }, ROW_MAP);

  // Assert
  assert.deepEqual(patch, { loadKind: "range", loadValue: "60-70" });
});

test("a patch names only the fields it actually carries", () => {
  // A patch is applied over the row, so a key present with an empty value would clear a field
  // the user never touched.
  assert.deepEqual(setEntryPatchToRow<Row>({ reps: "" }, ROW_MAP), { reps: "" });
  assert.deepEqual(Object.keys(setEntryPatchToRow<Row>({ reps: "10" }, ROW_MAP)), ["reps"]);
});

test("a field the row does not hold is dropped rather than invented", () => {
  // The two directions read one table, so a field outside it cannot reach the row at all —
  // `showLoad` is this case in the wild: a disclosure the log row owns, not a field the set
  // submits, so it is deliberately absent from the map.
  assert.deepEqual(setEntryPatchToRow<Row>({ distance: "5" }, ROW_MAP), {});
});

test("a pre-filled row seeds every field through one pre-fill reader", () => {
  // The uncontrolled forms do not hold a row object at all: each field's pre-fill is a function
  // of its submitted name — the recovered draft's value for it, or the record's own. So the seed
  // is a fallbacks table read through that function, not a second hand-written mapper.
  const recovered: Record<string, string> = { "set-2-reps": "10" };
  const initial = (name: string, fallback: string | number | null | undefined) =>
    recovered[name] ?? String(fallback ?? "");

  // Act
  const values = seededSetEntryValues(
    "set-2",
    { reps: 12, load_kind: "absolute", load_value: 60, rpe: null, note: undefined },
    initial,
  );

  // Assert — the recovered draft wins over the record, a number becomes its text, and a null or
  // missing fallback reads blank rather than "null" or "undefined".
  assert.equal(values.reps, "10");
  assert.equal(values.load_kind, "absolute");
  assert.equal(values.load_value, "60");
  assert.equal(values.rpe, "");
  assert.equal(values.note, "");
  // A field with no entry in the table is still present and blank.
  assert.equal(values.movement, "");
});

test("a seeded field is read under its own indexed name", () => {
  // The pre-fill reader is keyed by the submitted name, so an off-by-one in the prefix would
  // silently seed a row from its neighbour's values.
  const seen: string[] = [];
  seededSetEntryValues("set-5", { reps: "" , note: "" }, (name) => {
    seen.push(name);
    return "";
  });
  assert.deepEqual(seen, ["set-5-reps", "set-5-note"]);
});

test("the vocabulary covers each field the four log forms submit", () => {
  // A regression pin on the wire contract itself: these are the names the server actions'
  // readers walk, so dropping or renaming one is a silent data loss, not a refactor.
  const expected: readonly SetEntryField[] = [
    "movement", "kind", "reps", "distance", "unit", "duration",
    "load_kind", "load_value", "rpe", "note",
  ];
  assert.deepEqual([...SET_ENTRY_FIELDS], expected);
});
