import { DEFAULT_EFFORT_SCALE, type EffortScale } from "./effort.ts";
import { defaultLoadKindForAmount } from "./hand-authored-session.ts";
import type { LoadKind } from "./load.ts";
import { toIntOrZero } from "./numeric-input.ts";
import type { PrescriptionEvent } from "./prescription-draft.ts";
import type { DraftPrescription } from "./protocol-builder.ts";
import type { DistanceUnit, QuantityKind } from "./quantity.ts";
import { planSetType } from "./set-type-view.ts";
import { targetEffortFromInput } from "./target-effort-view.ts";

// Which controls the shared Prescription field stack renders, declared per authoring surface
// (ADR-0129, audit C-2). The stack used to infer this from which optional handlers a surface
// happened to pass (no `onChangeNote` meant no Note control) and from per-surface booleans
// (`showRest`, `suppressWarmUpSummaryChip`). A forgotten handler dropped a control silently,
// and nothing in the types said so. Now a surface names its preset; the stack renders exactly
// the controls in it; and `prescription-controls.test.ts` holds each preset to the fields that
// surface's payload actually sends.

// Every control the stack can render. `quantity` is the kind picker plus, for a distance, the
// unit; `load` is the kind picker plus its value; `targetEffort` is the scale plus its value.
export const PRESCRIPTION_CONTROLS = [
  "quantity",
  "sets",
  "target",
  "load",
  "rest",
  "tempo",
  "setType",
  "targetEffort",
  "note",
] as const;

export type PrescriptionControl = (typeof PRESCRIPTION_CONTROLS)[number];

// The three surfaces that author an Exercise Prescription (ADR-0067).
export type PrescriptionSurface = "insert" | "handAuthored" | "builder";

interface SurfacePreset {
  controls: readonly PrescriptionControl[];
  // The surface already shows each exercise's Session Section (the composition strip's WARM-UP
  // band, ADR-0074), so a warm-up Set Type chip on the row would say it twice.
  showsSessionSection: boolean;
}

const WITHOUT_TARGET_EFFORT_AND_NOTE = PRESCRIPTION_CONTROLS.filter(
  (control) => control !== "targetEffort" && control !== "note",
);

// Insert authors no Target Effort and no Note: its request (`buildInsertPrescriptionRequest`)
// carries neither, so offering the controls would accept input and then drop it.
export const PRESCRIPTION_SURFACES = {
  insert: { controls: WITHOUT_TARGET_EFFORT_AND_NOTE, showsSessionSection: false },
  handAuthored: { controls: PRESCRIPTION_CONTROLS, showsSessionSection: true },
  builder: { controls: PRESCRIPTION_CONTROLS, showsSessionSection: true },
} as const satisfies Record<PrescriptionSurface, SurfacePreset>;

// What the stack is handed: the controls to render on this row, and whether its summary drops
// the warm-up Set Type chip.
export interface PrescriptionControlSet {
  controls: ReadonlySet<PrescriptionControl>;
  suppressWarmUpSummaryChip: boolean;
}

// The control set for one row on `surface`. A grouped Superset member rests once per round at
// the group level (ADR-0023), so its own Rest is dormant: not rendered, and no rest chip.
export function prescriptionControlSet(
  surface: PrescriptionSurface,
  { grouped }: { grouped: boolean },
): PrescriptionControlSet {
  const preset = PRESCRIPTION_SURFACES[surface];
  return {
    controls: new Set(
      preset.controls.filter((control) => !(grouped && control === "rest")),
    ),
    suppressWarmUpSummaryChip: preset.showsSessionSection,
  };
}

// The values the stack renders, each the display string the surface holds (ADR-0067). The
// Target Effort and the Note are optional because a surface without those controls holds none.
export interface PrescriptionControlValues {
  kind: QuantityKind;
  unit: DistanceUnit;
  sets: string;
  target: string;
  restSeconds: string;
  tempo: string;
  setType: string;
  targetEffortScale?: EffortScale;
  targetEffortValue?: string;
  note?: string;
  loadKind: string;
  loadValue: string;
}

// One edit the stack reports. The surface owns what it means: the ad-hoc surfaces patch their
// row (`authoredRowPatch`), the Builder dispatches an event (`builderPrescriptionEvent`).
export type PrescriptionControlEdit =
  | { field: "kind"; value: QuantityKind }
  | { field: "unit"; value: DistanceUnit }
  | {
      field:
        | "sets"
        | "target"
        | "restSeconds"
        | "tempo"
        | "setType"
        | "note"
        | "loadKind"
        | "loadValue";
      value: string;
    }
  | { field: "targetEffort"; scale: EffortScale; value: string };

// The plan fields an ad-hoc row (Insert's editor, a Hand-Authored exercise row) holds, named as
// those rows name them: the target is `reps`.
export interface AuthoredPlanRow {
  kind: QuantityKind;
  unit: DistanceUnit;
  sets: string;
  reps: string;
  restSeconds: string;
  tempo: string;
  setType: string;
  note: string;
  targetEffortScale: EffortScale;
  targetEffortValue: string;
  loadKind: string;
  loadValue: string;
}

// The row patch for one edit on an ad-hoc surface. Picking a kind re-defaults the Load kind for
// it (bodyweight for a hold or a run, absolute for reps), still overridable afterwards.
export function authoredRowPatch(edit: PrescriptionControlEdit): Partial<AuthoredPlanRow> {
  switch (edit.field) {
    case "kind":
      return { kind: edit.value, loadKind: defaultLoadKindForAmount(edit.value) };
    case "unit":
      return { unit: edit.value };
    case "target":
      return { reps: edit.value };
    case "targetEffort":
      return { targetEffortScale: edit.scale, targetEffortValue: edit.value };
    case "sets":
      return { sets: edit.value };
    case "restSeconds":
      return { restSeconds: edit.value };
    case "tempo":
      return { tempo: edit.value };
    case "setType":
      return { setType: edit.value };
    case "note":
      return { note: edit.value };
    case "loadKind":
      return { loadKind: edit.value };
    case "loadValue":
      return { loadValue: edit.value };
  }
}

// The Builder's view of one draft Prescription as the stack's display strings.
export function builderControlValues(
  prescription: DraftPrescription,
): PrescriptionControlValues {
  return {
    kind: prescription.quantityKind,
    unit: prescription.quantityUnit,
    sets: String(prescription.sets),
    target: prescription.reps,
    restSeconds: prescription.restSeconds === null ? "" : String(prescription.restSeconds),
    tempo: prescription.tempo ?? "",
    setType: prescription.setType ?? "",
    // The draft holds the typed Target Effort; an unset one defaults the scale and leaves the
    // value blank.
    targetEffortScale: prescription.targetEffort?.scale ?? DEFAULT_EFFORT_SCALE,
    targetEffortValue: prescription.targetEffort ? String(prescription.targetEffort.value) : "",
    // The draft holds the decoded cue (`initBuilderDraft`), so it renders directly.
    note: prescription.note ?? "",
    loadKind: prescription.loadKind,
    loadValue: prescription.loadValue,
  };
}

// The Builder event for one edit on the Prescription at `position`. Unlike the ad-hoc surfaces,
// picking a Quantity kind leaves the Load alone, so a generated Load being edited is never
// silently discarded. Blank optional values are stored as unset (null).
export function builderPrescriptionEvent(
  position: number,
  prescription: DraftPrescription,
  edit: PrescriptionControlEdit,
): PrescriptionEvent {
  switch (edit.field) {
    case "kind":
      return {
        type: "SET_QUANTITY",
        position,
        quantityKind: edit.value,
        quantityUnit: prescription.quantityUnit,
      };
    case "unit":
      return {
        type: "SET_QUANTITY",
        position,
        quantityKind: prescription.quantityKind,
        quantityUnit: edit.value,
      };
    case "sets":
      return { type: "EDIT_PRESCRIPTION", position, field: "sets", value: toIntOrZero(edit.value) };
    case "target":
      return { type: "EDIT_PRESCRIPTION", position, field: "reps", value: edit.value };
    case "restSeconds":
      return {
        type: "EDIT_PRESCRIPTION",
        position,
        field: "restSeconds",
        value: edit.value === "" ? null : toIntOrZero(edit.value),
      };
    case "tempo":
      return {
        type: "EDIT_PRESCRIPTION",
        position,
        field: "tempo",
        value: edit.value === "" ? null : edit.value,
      };
    // The working default is stored as unset, so a plain set carries no annotation (#466).
    case "setType":
      return { type: "SET_SET_TYPE", position, setType: planSetType(edit.value) };
    case "targetEffort":
      return {
        type: "SET_TARGET_EFFORT",
        position,
        targetEffort: targetEffortFromInput(edit.scale, edit.value),
      };
    case "note":
      return {
        type: "SET_NOTE",
        position,
        note: edit.value.trim() === "" ? null : edit.value,
      };
    case "loadKind":
      return {
        type: "EDIT_LOAD",
        position,
        loadKind: edit.value as LoadKind,
        loadValue: prescription.loadValue,
      };
    case "loadValue":
      return {
        type: "EDIT_LOAD",
        position,
        loadKind: prescription.loadKind,
        loadValue: edit.value,
      };
  }
}
