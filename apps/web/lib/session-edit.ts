// The Edit view-model (ADR-0133): open a standalone Session in the Hand-Authored editor and
// save it back in place. Pure and browser-safe, so the Session → editor fold and the editor →
// request fold are unit-tested here rather than re-derived in the page or the form.
//
// The fold is faithful: every authored field the editor can show is seeded (sets, target,
// rest, tempo, typed Load, Amount kind, Set Type, Target Effort, Note, Supersets), the stored
// note is decoded so a save never double-escapes it, and the movement's Progression Scheme —
// which the editor has no control for — rides on the row untouched so an edit never silently
// resets it. A newly added movement starts with no scheme (the default).

import { DEFAULT_EFFORT_SCALE } from "./effort.ts";
import {
  isPlanDraft,
  isPlanExerciseRow,
  makeKey,
  makePlanRow,
  toAuthoredFields,
  type PlanExerciseRow,
} from "./hand-authored-draft.ts";
import {
  buildAuthorPlanRequest,
  type AuthorPrescriptionInput,
} from "./hand-authored-session.ts";
import { loadToFields } from "./load.ts";
import { noteText } from "./note-view.ts";
import type { PickedExercise } from "./protocol-builder.ts";
import { distanceUnitFromText, type QuantityKind } from "./quantity.ts";
import type { ExercisePrescription, WorkoutSession } from "./sessions-types.ts";
import type { WeightUnit } from "./weight-unit";

const DEFAULT_AMOUNT_KIND: QuantityKind = "repetitions";

// One editor row: a plan row plus the movement's carried Progression Scheme (`null` for the
// default). The shared editor is generic over the row, so the scheme survives reorder, field
// edits and Superset grouping without the editor knowing it exists.
export interface EditPlanRow extends PlanExerciseRow {
  scheme: string | null;
}

export interface EditSeed {
  trainingType: string;
  rows: EditPlanRow[];
}

// The replace-plan request: the authored plan shape, each prescription carrying its scheme.
export interface EditPrescriptionInput extends AuthorPrescriptionInput {
  scheme: string | null;
}

export interface EditPlanInput {
  training_type: string;
  prescriptions: EditPrescriptionInput[];
}

export type EditPlanResult =
  | { ok: true; request: EditPlanInput }
  | { ok: false; error: string };

// Whether the Session detail offers Edit, and where it leads. Standalone-only, like Insert and
// Remove: a Protocol member is edited through the Builder's tail-gated Deploy (ADR-0020).
export interface SessionEditView {
  show: boolean;
  href: string;
}

export function sessionEditView(
  session: Pick<WorkoutSession, "id" | "is_protocol_member">,
): SessionEditView {
  return {
    show: !(session.is_protocol_member ?? false),
    href: `/sessions/${session.id}/edit`,
  };
}

function editRowFromPrescription(
  prescription: ExercisePrescription,
  weightUnit: WeightUnit,
): EditPlanRow {
  const quantity = prescription.prescribed_quantity ?? null;
  const kind = quantity?.kind ?? DEFAULT_AMOUNT_KIND;
  const effort = prescription.target_effort ?? null;
  return {
    key: makeKey(),
    exerciseId: prescription.exercise_id,
    exerciseName: prescription.exercise_name,
    kind,
    unit: kind === "distance" ? distanceUnitFromText(quantity?.text) : "km",
    sets: String(prescription.sets),
    reps: prescription.reps,
    restSeconds:
      prescription.rest_seconds === null ? "" : String(prescription.rest_seconds),
    tempo: prescription.tempo ?? "",
    setType: prescription.set_type ?? "",
    note: noteText(prescription.note) ?? "",
    targetEffortScale: effort?.scale ?? DEFAULT_EFFORT_SCALE,
    targetEffortValue: effort ? String(effort.value) : "",
    ...loadToFields(prescription.recommended_load, weightUnit),
    supersetGroup: prescription.superset_group ?? null,
    roundRestSeconds: prescription.round_rest_seconds ?? null,
    scheme: prescription.scheme ?? null,
  };
}

// Fold a standalone Session into the editor's opening state, in the Session's order.
export function editSeedFromSession(
  session: Pick<WorkoutSession, "training_type" | "prescriptions">,
  weightUnit: WeightUnit,
): EditSeed {
  return {
    trainingType: session.training_type,
    rows: session.prescriptions.map((prescription) =>
      editRowFromPrescription(prescription, weightUnit),
    ),
  };
}

// A movement added during the edit: a fresh plan row with the default scheme.
export function makeEditRow(exercise: PickedExercise): EditPlanRow {
  return { ...makePlanRow(exercise), scheme: null };
}

// Fold the edited rows into the replace-plan request. Validation is the plan-only builder's,
// so Build, Capture and Edit agree on what a valid plan is; its prescriptions map 1:1, in
// order, to the rows, which is how each row's scheme is re-attached.
export function buildEditPlanRequest(
  fields: { trainingType: string; rows: readonly EditPlanRow[] },
  weightUnit: WeightUnit,
): EditPlanResult {
  const result = buildAuthorPlanRequest(
    { trainingType: fields.trainingType, exercises: fields.rows.map(toAuthoredFields) },
    weightUnit,
  );
  if (!result.ok) return result;
  return {
    ok: true,
    request: {
      training_type: result.request.training_type,
      prescriptions: result.request.prescriptions.map((prescription, index) => ({
        ...prescription,
        scheme: fields.rows[index].scheme,
      })),
    },
  };
}

// The stored-draft guard for the edit form: a plan draft whose rows also carry a valid scheme.
export function isEditDraft(
  value: unknown,
): value is { trainingType: string; exercises: EditPlanRow[] } {
  if (!isPlanDraft(value)) return false;
  return value.exercises.every(
    (row) =>
      isPlanExerciseRow(row) &&
      ((row as Partial<EditPlanRow>).scheme === null ||
        typeof (row as Partial<EditPlanRow>).scheme === "string"),
  );
}
