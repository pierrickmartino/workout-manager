// The one vocabulary a set-entry field is addressed by (ADR-0106). A Logged Set's amount and
// Load entry UI was written four times — `AdhocLogForm`, `CorrectLogForm` (twice: a pre-filled
// row and an added one), `LogSessionForm`, `live-session-sets` — and the copies had drifted:
// two of the five typed-Load fields asked for no keypad at all (ADR-0093), and one distance
// field was not a `type="number"`, so it offered no numeric keypad either. Adding a Load kind
// meant editing four files, and missing one would degrade a typed Load (ADR-0010) in exactly
// one form, silently.
//
// This module is the pure half: the field vocabulary, the names a field submits and answers
// to, and which of React's two value props it takes. No React, no I/O — the component family
// in `components/pulse/set-entry.tsx` renders against it.

import type { QuantityKind } from "./quantity.ts";

// Every field a set row can carry, named exactly as it is submitted. One vocabulary serves
// both the `name=` attribute and the values record, so there is no mapping table between the
// two and therefore nothing for them to drift against. These words are the wire contract the
// server actions' readers walk (`readAdhocFormRows`, `readLogFormRows`, the correction
// reader): all four forms post `set-<i>-<field>` under a `set_count` header.
export const SET_ENTRY_FIELDS = [
  "movement",
  "kind",
  "reps",
  "distance",
  "unit",
  "duration",
  "load_kind",
  "load_value",
  "rpe",
  "note",
] as const;

export type SetEntryField = (typeof SET_ENTRY_FIELDS)[number];

// A row's field values as the entry UI holds them: raw strings, exactly as typed, because a
// field's value is parsed and typed at the write boundary rather than in the input. Every
// field is present — see `setEntryValues`.
export type SetEntryValues = Readonly<Record<SetEntryField, string>>;

// The visible micro-label over each field, and the noun its accessible name is built from.
// One caption per field in one place: the four copies had drifted here too, captioning the
// Quantity picker one way in one form and another way elsewhere. The amount axis is called
// **Quantity** to a user (CONTEXT 'Quantity' lists the alternative under _Avoid_, and the
// terminology guard bans it as a quoted label): the one form that said so was right, and the
// three that did not are the ones that moved.
export const SET_ENTRY_LABELS: Readonly<Record<SetEntryField, string>> = {
  movement: "Movement",
  kind: "Quantity",
  reps: "Reps",
  distance: "Distance",
  unit: "Unit",
  // The companion time on a distance is optional (ADR-0032): given, pace becomes a
  // derivable read. A duration *is* the amount, so `SetEntryDuration` captions it "Time".
  duration: "Time (opt.)",
  load_kind: "Load kind",
  load_value: "Load",
  rpe: "RPE",
  note: "Note",
};

// Fill the record from whatever a caller holds. Each of the four forms keeps its own row type
// — a draft row, a correction's pre-filled fields, a prescription-seeded log row, a live set —
// so each maps its own shape in and the unused fields read blank rather than absent.
//
// Absent is the failure worth naming: a controlled `<input value={undefined}>` is an
// *uncontrolled* input to React, so every keystroke in it would be silently discarded.
export function setEntryValues(given: Partial<SetEntryValues>): SetEntryValues {
  const values: Record<SetEntryField, string> = {} as Record<SetEntryField, string>;
  for (const field of SET_ENTRY_FIELDS) values[field] = given[field] ?? "";
  return values;
}

// The `set-<i>` prefix a row's fields submit under. The readers walk rows by contiguous index
// 0…set_count-1, so this follows the row's array position, never its React key.
export function setEntryPrefix(index: number): string {
  return `set-${index}`;
}

// The `name=` for one field, or `undefined` for a row that posts nothing. A Live Session is
// ephemeral and client-side until it is finished (ADR-0012): its rows sit in no form, so a
// `name` on them would promise a collection that never happens.
export function setEntryName(
  prefix: string | null,
  field: SetEntryField,
): string | undefined {
  return prefix === null ? undefined : `${prefix}-${field}`;
}

// How a row is referred to in its fields' accessible names. Both joiners are kept because
// each reads correctly where it is used: a row that names its movement takes "for"
// ("Distance for Back Squat"), and one identified by its ordinal takes a comma
// ("Distance, added set 3"). A screen of near-identical rows is exactly where a bare
// "Distance" leaves a screen-reader user with no way to tell which set they are in.
export type SetEntryJoiner = "for" | "comma";

export interface SetEntrySubject {
  readonly joiner: SetEntryJoiner;
  readonly name: string;
}

// The accessible name for one field of one row.
export function setEntryLabel(subject: SetEntrySubject, caption: string): string {
  return subject.joiner === "for"
    ? `${caption} for ${subject.name}`
    : `${caption}, ${subject.name}`;
}

// Whether a row's fields are driven by their holder or seeded once and left to the DOM. This
// is the one real difference the audit named between the four forms: the two client-state
// forms are controlled, and the two server-action forms seed `defaultValue` and read the
// values back out of the FormData on submit.
export type SetEntryMode = "controlled" | "uncontrolled";

// The value half of a field's props — whichever single prop its mode means.
export interface SetEntryValueBinding {
  readonly value?: string;
  readonly defaultValue?: string;
}

// Resolve the mode into props, so no field component has to know which kind of form it is in.
// Exactly one key is present: React decides an input is controlled by whether `value` is
// nullish, so a binding carrying `value: undefined` beside a `defaultValue` would read as
// uncontrolled, and one carrying `defaultValue: undefined` beside a `value` warns.
export function setEntryValueBinding(
  mode: SetEntryMode,
  current: string,
): SetEntryValueBinding {
  return mode === "controlled" ? { value: current } : { defaultValue: current };
}

// The Quantity kinds a *logging* picker offers (ADR-0032). Deliberately not
// `AMOUNT_KIND_OPTIONS` from `lib/quantity.ts`, which the authoring surfaces use: that list
// orders them Reps / Duration / Distance and these forms have always shown Reps / Distance /
// Duration. The two orders are a pre-existing inconsistency, and silently reordering a picker
// in four forms is a change to what users see, not a refactor — so the difference is stated
// here, in one place, instead of being spread across four.
export const SET_ENTRY_KIND_OPTIONS: ReadonlyArray<{
  readonly value: QuantityKind;
  readonly label: string;
}> = [
  { value: "repetitions", label: "Reps" },
  { value: "distance", label: "Distance" },
  { value: "duration", label: "Duration" },
];

// The values the Effort picker offers, on its RPE scale. Declared once: three of the four forms
// had their own copy of this array.
//
// It is 1-10 integers, which is **narrower than the domain**: CONTEXT 'Effort' defines the RPE
// scale as 0-10 with half-steps allowed. That gap is pre-existing — all four copies offered
// exactly this — and widening a picker is a change to what users can record, not a refactor, so
// it is left as it was. What changes is that it is now one list instead of four, so closing the
// gap is a one-line edit rather than a four-file hunt.
export const SET_ENTRY_EFFORT_VALUES: readonly number[] = Array.from(
  { length: 10 },
  (_, index) => index + 1,
);

// The card a set row renders in. Three of the four forms wrote this exact string; the other
// two differ for reasons of their own (a skipped log row dims and tightens its padding, a
// Live Session set is a `Card`), so this is a shared constant rather than a wrapper component
// with a flag to turn it into something else.
export const SET_ENTRY_CARD =
  "flex flex-col gap-3 rounded-md border border-border bg-surface p-4";

// The mask a time field shows. `mm:ss` names the shape of the value rather than giving an
// example of one, which is what keeps it readable as an instruction in every one of the
// places a duration is entered (ADR-0101).
export const DURATION_PLACEHOLDER = "mm:ss";

// A form's own row keys against the entry vocabulary, for the two forms whose rows are
// `camelCase`. Neither can simply adopt the wire spelling as its field names: the ad-hoc row is
// also what gets persisted as a recovery draft, and the log row is built and read by a `lib/`
// view-model with its own tests.
//
// Declared as a table rather than written as two mapping functions, because two of those drift:
// a field added to one direction and forgotten in the other silently discards that field's
// edits, which is the same class of bug this whole family exists to end. A field absent from
// the table does not reach the row at all — `showLoad` is that case in the wild, being a
// disclosure the log row owns rather than a field the set submits.
export type SetEntryRowMap<Row> = Partial<Record<SetEntryField, keyof Row & string>>;

// A form's row as the entry vocabulary. Values are stringified because every mapped field is
// already a string or a string-union on the row side — the entry UI holds raw text, and a value
// is parsed and typed at the write boundary rather than in the input.
export function rowToSetEntryValues<Row extends object>(
  row: Row,
  map: SetEntryRowMap<Row>,
): SetEntryValues {
  const given: Partial<Record<SetEntryField, string>> = {};
  for (const field of SET_ENTRY_FIELDS) {
    const key = map[field];
    if (key === undefined) continue;
    given[field] = String((row as Record<string, unknown>)[key] ?? "");
  }
  return setEntryValues(given);
}

// An edit patch back under the row's own spelling. The one cast is the row's own narrowing — a
// `LoadKind`, a `DistanceUnit`, a `QuantityKind` — and it holds because every picker that can
// raise one renders its options *from* that closed vocabulary, so a value outside it has no way
// to be chosen.
export function setEntryPatchToRow<Row extends object>(
  patch: Partial<SetEntryValues>,
  map: SetEntryRowMap<Row>,
): Partial<Row> {
  const row: Record<string, string> = {};
  for (const field of SET_ENTRY_FIELDS) {
    const key = map[field];
    const value = patch[field];
    if (key === undefined || value === undefined) continue;
    row[key] = value;
  }
  return row as Partial<Row>;
}

// The per-field fallbacks a seeded row declares: the record's own value for each field it
// carries, before any recovered draft overrides it. A field absent from the table is simply not
// seeded, and reads blank.
export type SetEntryFallbacks = Partial<
  Record<SetEntryField, string | number | null | undefined>
>;

// A field's pre-fill, as the seeded forms read it: the recovered draft's value for that submitted
// name, or the fallback. Keyed by name rather than by field, because a form restored from a
// serialized `FormData` has only names to look itself up by.
export type SetEntryPreFill = (
  name: string,
  fallback: string | number | null | undefined,
) => string;

// Seed a row from a table of per-field fallbacks read through one pre-fill function — the
// uncontrolled counterpart of `rowToSetEntryValues`, for the forms that hold no row object.
// A table rather than a hand-written mapper for the same reason: a field added to one direction
// and forgotten in the other would seed a field the form then saves blank.
export function seededSetEntryValues(
  prefix: string,
  fallbacks: SetEntryFallbacks,
  initial: SetEntryPreFill,
): SetEntryValues {
  const given: Partial<Record<SetEntryField, string>> = {};
  for (const field of SET_ENTRY_FIELDS) {
    if (!Object.hasOwn(fallbacks, field)) continue;
    given[field] = initial(`${prefix}-${field}`, fallbacks[field]);
  }
  return setEntryValues(given);
}
