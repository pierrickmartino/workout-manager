// Pure form-model, parsing, validation, and partial-patch logic for the admin Exercise
// editor (issue #502, ADR-0075/0076 spec §5). Frontend logic lives here per the repo rule
// so it is unit-testable with `node --test` and the editor component stays thin. No server
// or React imports.
//
// The editor edits exactly the descriptive set — display name, description, Execution
// Steps, targeted muscles, required equipment, difficulty — and the Primary/Secondary
// emphasis split. Provenance, precautions, the Image, and the retired tombstone are each a
// separate deliberate act and are not touched here. Edits are partial: `buildExercisePatch`
// diffs the initial fields against the current ones and emits *only the changed fields*, so
// the PATCH request never overwrites a field the admin did not touch.

// The subset of the Exercise detail wire shape the editor reads to seed its form. A
// structural subset of `ExerciseDetail` (lib/sessions-types), named here so this module
// stays free of server-only imports.
export interface EditableExercise {
  name: string;
  description: string | null;
  targeted_muscles: string[];
  primary_muscles: string[];
  secondary_muscles: string[];
  required_equipment: string[];
  instructions: string[];
  difficulty: number | null;
}

// The editor's form state — every field a string, as the text inputs and textareas hold it.
// Lists are edited as text (comma/newline-separated for muscles and equipment; one Execution
// Step per line); difficulty is the raw numeric string, blank when the movement carries none.
export interface ExerciseEditorFields {
  name: string;
  description: string;
  targetedMuscles: string;
  primaryMuscles: string;
  secondaryMuscles: string;
  requiredEquipment: string;
  instructions: string;
  difficulty: string;
}

// The wire payload of a partial edit — the keys the backend `PATCH /api/exercises/{id}`
// body accepts. Every field is optional: only the fields the admin changed are sent.
export interface ExercisePatchPayload {
  name: string;
  description: string | null;
  targeted_muscles: string[];
  primary_muscles: string[];
  secondary_muscles: string[];
  required_equipment: string[];
  instructions: string[];
  difficulty: number | null;
}

// The stored difficulty is a 1–10 scale (models.Exercise); mirror the backend bound so the
// editor rejects a bad value before the round-trip (the server still validates, returning
// 422).
export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 10;

// Split a free-text list field into clean entries: break on newlines and commas, trim each,
// and drop blanks. The client twin of the route's list sanitizer, so a stray empty row never
// becomes a catalog value.
export function parseListInput(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

// Split the Execution Steps field into ordered steps: one step per non-empty line, trimmed
// (ADR-0015 — never chop prose mid-sentence, so only line breaks separate steps).
export function parseStepsInput(value: string): string[] {
  return value
    .split(/\n/)
    .map((step) => step.trim())
    .filter((step) => step.length > 0);
}

// Parse the difficulty field. A blank field clears difficulty (`null`); otherwise the value
// must be an integer within 1–10, else the parse is invalid so the editor can flag it.
export type ParsedDifficulty =
  | { ok: true; value: number | null }
  | { ok: false };

export function parseDifficultyInput(value: string): ParsedDifficulty {
  const trimmed = value.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (!/^-?\d+$/.test(trimmed)) return { ok: false };
  const parsed = Number(trimmed);
  if (parsed < MIN_DIFFICULTY || parsed > MAX_DIFFICULTY) return { ok: false };
  return { ok: true, value: parsed };
}

// Seed the form from the fetched Exercise. Lists render one entry per line so an admin can
// edit them like a list; difficulty renders as its number or blank when unset.
export function toEditorFields(exercise: EditableExercise): ExerciseEditorFields {
  return {
    name: exercise.name,
    description: exercise.description ?? "",
    targetedMuscles: exercise.targeted_muscles.join("\n"),
    primaryMuscles: exercise.primary_muscles.join("\n"),
    secondaryMuscles: exercise.secondary_muscles.join("\n"),
    requiredEquipment: exercise.required_equipment.join("\n"),
    instructions: exercise.instructions.join("\n"),
    difficulty: exercise.difficulty === null ? "" : String(exercise.difficulty),
  };
}

// A trimmed description, with a blank collapsing to `null` — an empty description is "no
// description", never the empty string.
function descriptionToPayload(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// Validate the form before building a patch. Returns a user-facing message for the first
// problem, or `null` when the fields are sound. The backend re-validates (422) — this only
// spares an obviously-bad round-trip and gives an inline message.
export function validateEditorFields(fields: ExerciseEditorFields): string | null {
  if (fields.name.trim() === "") return "Name must not be blank.";
  if (!parseDifficultyInput(fields.difficulty).ok) {
    return `Difficulty must be a whole number from ${MIN_DIFFICULTY} to ${MAX_DIFFICULTY}, or blank.`;
  }
  return null;
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

// Build the partial patch: compare the current fields against the initial ones and include
// *only the fields that changed*, so an untouched field is never sent (and so never
// overwritten). Lists compare on their parsed, canonical form, so pure whitespace edits
// that don't change the entries are correctly treated as no change. Assumes the fields have
// passed `validateEditorFields`.
export function buildExercisePatch(
  initial: ExerciseEditorFields,
  current: ExerciseEditorFields,
): Partial<ExercisePatchPayload> {
  const patch: Partial<ExercisePatchPayload> = {};

  if (current.name.trim() !== initial.name.trim()) {
    patch.name = current.name.trim();
  }

  const nextDescription = descriptionToPayload(current.description);
  if (nextDescription !== descriptionToPayload(initial.description)) {
    patch.description = nextDescription;
  }

  const listFields = [
    ["targeted_muscles", "targetedMuscles", parseListInput],
    ["primary_muscles", "primaryMuscles", parseListInput],
    ["secondary_muscles", "secondaryMuscles", parseListInput],
    ["required_equipment", "requiredEquipment", parseListInput],
    ["instructions", "instructions", parseStepsInput],
  ] as const;
  for (const [payloadKey, fieldKey, parse] of listFields) {
    const next = parse(current[fieldKey]);
    if (!sameList(next, parse(initial[fieldKey]))) {
      patch[payloadKey] = next;
    }
  }

  const nextDifficulty = parseDifficultyInput(current.difficulty);
  const prevDifficulty = parseDifficultyInput(initial.difficulty);
  if (nextDifficulty.ok && prevDifficulty.ok && nextDifficulty.value !== prevDifficulty.value) {
    patch.difficulty = nextDifficulty.value;
  }

  return patch;
}

// Whether the current fields differ from the initial ones — drives the Save button's enabled
// state so a no-op save is never sent.
export function hasEditorChanges(
  initial: ExerciseEditorFields,
  current: ExerciseEditorFields,
): boolean {
  return Object.keys(buildExercisePatch(initial, current)).length > 0;
}
