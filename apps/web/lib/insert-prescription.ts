// The Insert view-model (ADR-0051, issue #360): turn the "Add exercise" editor's raw fields
// — one hand-authored Exercise Prescription (a picked Catalog Exercise with sets, a typed
// Quantity, rest, tempo, and a typed Load) — into the validated
// `POST /api/sessions/{id}/prescriptions` payload, or a single user-facing error. Pure and
// browser-safe (no server-only imports), so the request rules are unit-tested here rather
// than re-derived inside the server action or the component. The frontend twin of the
// backend's `insert_prescription` boundary.
//
// This is the single-prescription sibling of the Hand-Authored session view-model
// (`buildAuthorPlanRequest`): Insert appends exactly one movement, solo (non-Superset) in v1
// (#359), so there is no date, no performed sets, and no Superset overlay — the two overlay
// fields ride as `null`. The plan-side validation intentionally matches the Hand-Authored
// form's (sets ≥ 1, a non-blank target, a typed Load), so "what a valid authored
// prescription is" stays one rule across the surfaces that author one.

import {
  defaultLoadKindForAmount,
  wholeNonNegative,
  type AuthorPrescriptionInput,
} from "./hand-authored-session.ts";
import { loadValueToKg, type LoadKind } from "./load.ts";
import type { WeightUnit } from "./weight-unit";
import type { DistanceUnit, QuantityKind } from "./quantity";

// The "Add exercise" editor's fields for the one prescription being appended. `exerciseId` is
// `null` until the user picks a movement from the catalog (or mints one), which is why it is
// nullable here and the whole add is rejected while it is unset. Every other field mirrors the
// Hand-Authored form's plan-side inputs one-for-one.
export interface InsertPrescriptionFields {
  exerciseId: number | null;
  // The picked Amount kind (ADR-0032), defaulting to `repetitions`. Governs the target
  // field's wording in the editor and the Load kind's default here.
  kind: QuantityKind;
  // The distance unit (km/mi) a `distance` prescription reads in; ignored by other kinds but
  // carried through so the persisted plan keeps the authored unit (ADR-0050).
  unit: DistanceUnit;
  sets: string;
  // The plan-side target, free text for every kind (ADR-0032): a rep target ("8-12"), a hold
  // time ("45s"), or a distance ("5 km"). Only the missing-target wording follows the kind.
  reps: string;
  restSeconds: string;
  tempo: string;
  loadKind: string;
  loadValue: string;
}

export type InsertPrescriptionResult =
  | { ok: true; request: AuthorPrescriptionInput }
  | { ok: false; error: string };

// The required-target error for a prescription whose plan is missing a target, worded for the
// Amount kind so a duration/distance movement never errors about a "rep target" — the
// single-add twin of the Hand-Authored form's `missingTargetError`.
function missingTargetError(kind: QuantityKind): string {
  switch (kind) {
    case "duration":
      return "Add a target hold time for this exercise.";
    case "distance":
      return "Add a target distance for this exercise.";
    default:
      return "Add a rep target for this exercise.";
  }
}

// Assemble the Insert request from the "Add exercise" editor's fields, validating at the
// boundary: a picked catalog Exercise, a valid sets count (≥ 1), and a non-blank target. The
// typed Load rides as `load_kind`/`load_value` (with the Amount kind's default) and the picked
// Quantity kind/unit ride onto the plan so the authored kind is persisted, not dropped on save
// (ADR-0050). The Superset overlay is always `null` — Insert appends solo in v1 (#359).
// Returns the payload on success or a single user-facing error on the first problem; nothing is
// sent to the server on a rejection. The server re-validates through `validate_deploy` and can
// still reject (client-side validation is UX).
export function buildInsertPrescriptionRequest(
  fields: InsertPrescriptionFields,
  unit: WeightUnit,
): InsertPrescriptionResult {
  if (fields.exerciseId === null || !Number.isInteger(fields.exerciseId)) {
    return { ok: false, error: "Pick an exercise to add." };
  }

  const sets = wholeNonNegative(fields.sets);
  if (sets === null || sets < 1) {
    return { ok: false, error: "Add at least one set." };
  }

  const reps = fields.reps.trim();
  if (reps === "") {
    return { ok: false, error: missingTargetError(fields.kind) };
  }

  const tempo = fields.tempo.trim();
  const restSeconds = wholeNonNegative(fields.restSeconds);
  const loadKind = (fields.loadKind || defaultLoadKindForAmount(fields.kind)) as LoadKind;
  // The Load was authored in the reader's Weight Unit; convert it to canonical kilograms for
  // storage (#417). Blank stays "no load recorded" → null.
  const loadValue = loadValueToKg(loadKind, fields.loadValue.trim(), unit);

  return {
    ok: true,
    request: {
      exercise_id: fields.exerciseId,
      sets,
      reps,
      rest_seconds: restSeconds,
      tempo: tempo === "" ? null : tempo,
      load_kind: loadKind,
      load_value: loadValue === "" ? null : loadValue,
      // The picked Quantity kind and unit travel onto the plan so the choice is persisted, not
      // dropped on save (ADR-0050): the backend types the Prescribed Quantity from these. The
      // unit is only meaningful for a distance but rides for every kind, defaulting to km.
      quantity_kind: fields.kind,
      quantity_unit: fields.unit,
      // Insert appends a solo, non-Superset prescription in v1 (#359): no group overlay.
      superset_group: null,
      round_rest_seconds: null,
    },
  };
}
