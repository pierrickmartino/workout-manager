// The "Missing equipment?" sheet on the Session page (ADR-0143, #791, GLOSSARY "Equipment
// Substitution"). The user picks the Available Equipment they have for this one action
// (pre-filled with their Default Equipment, one-tap Bodyweight only), previews every Exercise
// Prescription that equipment blocks (its catalog substitute, or "will be generated"), unticks any
// they would rather keep, confirms, and reads an outcome per row: substituted, or flagged and
// kept as prescribed. Disabled while a Live Session for this Session is open (ADR-0012).
// Pure: no server or React imports, so it is unit-testable with `node --test`.

import type { Equipment } from "./equipment.ts";
import type { WorkoutSession } from "./sessions-types.ts";
import {
  prefillSubstituteEquipment,
  toggleSubstituteEquipment,
} from "./substitute-equipment.ts";

// --- API shapes ------------------------------------------------------------------------

// One preview row: a blocked prescription and its catalog substitute, or `null` when the AI
// would invent one (`needs_generation`).
export interface BlockedRow {
  position: number;
  exercise_id: number;
  exercise_name: string;
  substitute: { exercise_id: number; name: string } | null;
  needs_generation: boolean;
}

export interface PositionOutcome {
  position: number;
  status: "substituted" | "failed";
  source: "catalog" | "generated" | null;
  reason: string | null;
}

interface PreviewEnvelope {
  success: boolean;
  data: { rows: BlockedRow[] } | null;
  error: string | null;
}

interface ApplyEnvelope {
  success: boolean;
  data: { session: WorkoutSession; outcomes: PositionOutcome[] } | null;
  error: string | null;
}

export type PreviewResult = { ok: true; rows: BlockedRow[] } | { ok: false; message: string };

export type ApplyResult =
  | { ok: true; session: WorkoutSession; outcomes: PositionOutcome[] }
  | { ok: false; message: string };

export const EQUIPMENT_SUBSTITUTION_PREVIEW_FALLBACK_ERROR =
  "The blocked exercises couldn’t be listed. Please try again.";
export const EQUIPMENT_SUBSTITUTION_APPLY_FALLBACK_ERROR =
  "The exercises couldn’t be substituted. Please try again.";

export function toPreviewResult(envelope: PreviewEnvelope): PreviewResult {
  if (envelope.success && envelope.data) return { ok: true, rows: envelope.data.rows };
  return { ok: false, message: envelope.error ?? EQUIPMENT_SUBSTITUTION_PREVIEW_FALLBACK_ERROR };
}

export function toApplyResult(envelope: ApplyEnvelope): ApplyResult {
  if (envelope.success && envelope.data) {
    return { ok: true, session: envelope.data.session, outcomes: envelope.data.outcomes };
  }
  return { ok: false, message: envelope.error ?? EQUIPMENT_SUBSTITUTION_APPLY_FALLBACK_ERROR };
}

// --- Availability ----------------------------------------------------------------------

export const EQUIPMENT_SUBSTITUTION_LABEL = "Missing equipment?";
export const LIVE_SESSION_LOCK_NOTE = "Finish or discard your live session first.";
const OFFLINE_NOTE = "Offline — reconnect to substitute";

export interface EquipmentSubstitutionButtonInput {
  sessionId: number;
  // Whether single Substitute is offered here (`substituteView`): withheld on a performed
  // Protocol Session, so Equipment Substitution is too.
  showSubstitute: boolean;
  // The Session id of the resumable Live Session in client storage, or null when none.
  liveSessionId: number | null;
  online: boolean;
}

export interface EquipmentSubstitutionButtonView {
  visible: boolean;
  disabled: boolean;
  note: string | null;
}

export function equipmentSubstitutionButtonView({
  sessionId,
  showSubstitute,
  liveSessionId,
  online,
}: EquipmentSubstitutionButtonInput): EquipmentSubstitutionButtonView {
  if (!showSubstitute) return { visible: false, disabled: true, note: null };
  if (liveSessionId === sessionId) {
    return { visible: true, disabled: true, note: LIVE_SESSION_LOCK_NOTE };
  }
  if (!online) return { visible: true, disabled: true, note: OFFLINE_NOTE };
  return { visible: true, disabled: false, note: null };
}

// --- Sheet state -----------------------------------------------------------------------

export type EquipmentSubstitutionState =
  | { step: "closed" }
  | { step: "picking"; equipment: Equipment[]; error: string | null }
  | { step: "loadingPreview"; equipment: Equipment[] }
  | {
      step: "preview";
      equipment: Equipment[];
      rows: BlockedRow[];
      deselected: number[];
      error: string | null;
    }
  | { step: "applying"; equipment: Equipment[]; rows: BlockedRow[]; deselected: number[] }
  | {
      step: "outcome";
      rows: BlockedRow[];
      session: WorkoutSession;
      outcomes: PositionOutcome[];
    };

export type EquipmentSubstitutionAction =
  | { type: "opened"; defaultEquipment: readonly string[] }
  | { type: "equipmentToggled"; item: Equipment }
  | { type: "bodyweightOnlyChosen" }
  | { type: "previewRequested" }
  | { type: "previewLoaded"; rows: BlockedRow[] }
  | { type: "previewFailed"; message: string }
  | { type: "rowToggled"; position: number }
  | { type: "backToPicker" }
  | { type: "applyRequested" }
  | { type: "applied"; session: WorkoutSession; outcomes: PositionOutcome[] }
  | { type: "applyFailed"; message: string }
  | { type: "closed" };

export const initialEquipmentSubstitutionState: EquipmentSubstitutionState = { step: "closed" };

function picking(equipment: Equipment[], error: string | null = null): EquipmentSubstitutionState {
  return { step: "picking", equipment, error };
}

function toggled(deselected: readonly number[], position: number): number[] {
  return deselected.includes(position)
    ? deselected.filter((value) => value !== position)
    : [...deselected, position];
}

function pickerReducer(
  state: Extract<EquipmentSubstitutionState, { step: "picking" }>,
  action: EquipmentSubstitutionAction,
): EquipmentSubstitutionState {
  switch (action.type) {
    case "equipmentToggled":
      return picking(toggleSubstituteEquipment(state.equipment, action.item));
    case "bodyweightOnlyChosen":
      return picking([]);
    case "previewRequested":
      return { step: "loadingPreview", equipment: state.equipment };
    default:
      return state;
  }
}

function previewReducer(
  state: Extract<EquipmentSubstitutionState, { step: "preview" }>,
  action: EquipmentSubstitutionAction,
): EquipmentSubstitutionState {
  switch (action.type) {
    case "rowToggled":
      return { ...state, deselected: toggled(state.deselected, action.position), error: null };
    case "backToPicker":
      return picking(state.equipment);
    case "applyRequested":
      return canConfirmEquipmentSubstitution(state)
        ? {
            step: "applying",
            equipment: state.equipment,
            rows: state.rows,
            deselected: state.deselected,
          }
        : state;
    default:
      return state;
  }
}

export function equipmentSubstitutionReducer(
  state: EquipmentSubstitutionState,
  action: EquipmentSubstitutionAction,
): EquipmentSubstitutionState {
  if (action.type === "closed") return initialEquipmentSubstitutionState;
  if (action.type === "opened") return picking(prefillSubstituteEquipment(action.defaultEquipment));
  switch (state.step) {
    case "picking":
      return pickerReducer(state, action);
    case "loadingPreview":
      if (action.type === "previewLoaded") {
        return { step: "preview", equipment: state.equipment, rows: action.rows, deselected: [], error: null };
      }
      if (action.type === "previewFailed") return picking(state.equipment, action.message);
      return state;
    case "preview":
      return previewReducer(state, action);
    case "applying":
      if (action.type === "applied") {
        return { step: "outcome", rows: state.rows, session: action.session, outcomes: action.outcomes };
      }
      if (action.type === "applyFailed") return { ...state, step: "preview", error: action.message };
      return state;
    default:
      return state;
  }
}

// --- Preview rows ----------------------------------------------------------------------

export const WILL_BE_GENERATED = "Will be generated";

export interface PreviewRowView {
  position: number;
  exerciseName: string;
  replacement: string;
  selected: boolean;
}

type PreviewLike = Extract<EquipmentSubstitutionState, { step: "preview" | "applying" }>;

function previewLike(state: EquipmentSubstitutionState): PreviewLike | null {
  return state.step === "preview" || state.step === "applying" ? state : null;
}

export function previewRows(state: EquipmentSubstitutionState): PreviewRowView[] {
  const shown = previewLike(state);
  if (shown === null) return [];
  return shown.rows.map((row) => ({
    position: row.position,
    exerciseName: row.exercise_name,
    replacement: row.substitute?.name ?? WILL_BE_GENERATED,
    selected: !shown.deselected.includes(row.position),
  }));
}

// The positions to substitute: every previewed row the user kept ticked, in Session order.
export function selectedPositions(state: EquipmentSubstitutionState): number[] {
  return previewRows(state)
    .filter((row) => row.selected)
    .map((row) => row.position);
}

export function canConfirmEquipmentSubstitution(state: EquipmentSubstitutionState): boolean {
  return state.step === "preview" && selectedPositions(state).length > 0;
}

// --- Outcome rows ----------------------------------------------------------------------

export interface OutcomeRowView {
  position: number;
  exerciseName: string;
  detail: string;
  flagged: boolean;
}

const SOURCE_LABEL: Record<"catalog" | "generated", string> = {
  catalog: "from the catalog",
  generated: "generated",
};

const FAILED_FALLBACK_REASON = "No alternative found for this equipment.";

function outcomeDetail(outcome: PositionOutcome, session: WorkoutSession): string {
  if (outcome.status === "failed") {
    return `${outcome.reason ?? FAILED_FALLBACK_REASON} Kept as prescribed.`;
  }
  const now = session.prescriptions.find((item) => item.position === outcome.position);
  const source = SOURCE_LABEL[outcome.source ?? "catalog"];
  return now ? `Now ${now.exercise_name} · ${source}` : `Substituted · ${source}`;
}

export function outcomeRows(state: EquipmentSubstitutionState): OutcomeRowView[] {
  if (state.step !== "outcome") return [];
  return state.outcomes.map((outcome) => ({
    position: outcome.position,
    exerciseName:
      state.rows.find((row) => row.position === outcome.position)?.exercise_name ?? "Exercise",
    detail: outcomeDetail(outcome, state.session),
    flagged: outcome.status === "failed",
  }));
}

export function outcomeSummary(state: EquipmentSubstitutionState): string {
  const rows = outcomeRows(state);
  const flagged = rows.filter((row) => row.flagged).length;
  const substituted = `${rows.length - flagged} substituted`;
  return flagged === 0 ? substituted : `${substituted} · ${flagged} flagged`;
}

export const NOTHING_BLOCKED_NOTE = "This equipment covers every exercise. Nothing to substitute.";
