import { formatLoad, type Load } from "./load.ts";
import type { Quantity } from "./quantity.ts";
import { sectionize } from "./session-section.ts";
import type { WorkoutSession } from "./sessions-types.ts";
import type { WeightUnit } from "./weight-unit.ts";

// The Warm-up Suggestion view-model (ADR-0143, #778). Pure and server-free, so the Session
// preview's warm-up button, the request lifecycle and the preview rows are unit-tested here and
// the component stays a thin shell. A suggestion is only a preview until the user taps Add,
// which saves the drills as the Session's leading Warm-up Section (#780).

// One suggested drill, in the Exercise Prescription shape the add step copies: one set, reps or
// seconds, a bodyweight or qualitative Load (never kg), 0–15 s rest, the warm-up Set Type.
export interface WarmUpDrill {
  exercise_id: number;
  exercise_name: string;
  sets: number;
  reps: string;
  prescribed_quantity: Quantity;
  recommended_load: Load;
  rest_seconds: number;
  set_type: string;
}

// The `POST /api/sessions/{id}/warm-up-suggestion` payload.
export interface WarmUpSuggestion {
  drills: WarmUpDrill[];
  estimated_minutes: number;
  has_warm_up_section: boolean;
}

// The envelope fields the result mapper reads (the shape `lib/api.ts` returns).
interface WarmUpEnvelope {
  success: boolean;
  data: WarmUpSuggestion | null;
  error: string | null;
}

export type WarmUpResult =
  | { ok: true; suggestion: WarmUpSuggestion }
  | { ok: false; message: string };

export const WARM_UP_FALLBACK_ERROR = "No warm-up could be suggested. Please try again.";

export const WARM_UP_ADD_FALLBACK_ERROR = "The warm-up couldn’t be added. Please try again.";

// The envelope fields the add mapper reads; the page re-reads the updated Session itself.
interface AddWarmUpEnvelope {
  success: boolean;
  error: string | null;
}

export type AddWarmUpResult = { ok: true } | { ok: false; message: string };

const OFFLINE_NOTE = "Offline — reconnect to get a warm-up";

export type WarmUpButtonLabel = "Warm-up" | "Replace warm-up";

export interface WarmUpButtonView {
  visible: boolean;
  label: WarmUpButtonLabel;
  disabled: boolean;
  offlineNote: string | null;
}

// Whether the Session opens with a Warm-up Section, read through the same Session Section
// projection the composition strip uses (ADR-0074), so "Replace" means exactly that run.
function opensWithWarmUp(session: WorkoutSession): boolean {
  const sections = sectionize(
    session.prescriptions.map((prescription) => ({
      exerciseName: prescription.exercise_name,
      setType: prescription.set_type ?? null,
      quantityKind: prescription.prescribed_quantity?.kind ?? null,
      supersetGroup: prescription.superset_group ?? null,
    })),
  );
  return sections[0] === "warm_up";
}

// The Session preview's warm-up button. Hidden once the Session has been performed (a
// performed Session is settled record, ADR-0020); disabled offline, since it is an AI call.
export function warmUpButtonView(session: WorkoutSession, online: boolean): WarmUpButtonView {
  return {
    visible: (session.logged_count ?? 0) === 0,
    label: opensWithWarmUp(session) ? "Replace warm-up" : "Warm-up",
    disabled: !online,
    offlineNote: online ? null : OFFLINE_NOTE,
  };
}

// The request lifecycle. `regenerate` rides on loading and error so a retry asks for the same
// thing the failed request did. Adding the previewed drills (#780) keeps the preview on screen
// while it saves and after a failure, so a retry re-sends exactly the drills the user saw.
export type WarmUpState =
  | { status: "idle" }
  | { status: "loading"; regenerate: boolean }
  | { status: "ready"; suggestion: WarmUpSuggestion }
  | { status: "error"; message: string; regenerate: boolean }
  | { status: "adding"; suggestion: WarmUpSuggestion }
  | { status: "addError"; suggestion: WarmUpSuggestion; message: string };

export type WarmUpAction =
  | { type: "requested"; regenerate: boolean }
  | { type: "succeeded"; suggestion: WarmUpSuggestion }
  | { type: "failed"; message: string }
  | { type: "discarded" }
  | { type: "addRequested" }
  | { type: "added" }
  | { type: "addFailed"; message: string };

export const initialWarmUpState: WarmUpState = { status: "idle" };

export function warmUpReducer(state: WarmUpState, action: WarmUpAction): WarmUpState {
  switch (action.type) {
    case "requested":
      return { status: "loading", regenerate: action.regenerate };
    case "succeeded":
      return { status: "ready", suggestion: action.suggestion };
    case "failed":
      return {
        status: "error",
        message: action.message,
        regenerate: state.status === "loading" ? state.regenerate : false,
      };
    case "discarded":
      return initialWarmUpState;
    case "addRequested":
      return "suggestion" in state ? { status: "adding", suggestion: state.suggestion } : state;
    case "added":
      return initialWarmUpState;
    case "addFailed":
      return state.status === "adding"
        ? { status: "addError", suggestion: state.suggestion, message: action.message }
        : state;
  }
}

export type WarmUpAddLabel = "Add" | "Adding…" | "Retry add";

// The preview's Add button. After a failed add it reads "Retry add" and re-sends the same drills.
export function warmUpAddLabel(state: WarmUpState): WarmUpAddLabel {
  if (state.status === "adding") return "Adding…";
  if (state.status === "addError") return "Retry add";
  return "Add";
}

// Map the endpoint's envelope onto a result the component dispatches.
export function toWarmUpResult(envelope: WarmUpEnvelope): WarmUpResult {
  if (envelope.success && envelope.data) {
    return { ok: true, suggestion: envelope.data };
  }
  return { ok: false, message: envelope.error ?? WARM_UP_FALLBACK_ERROR };
}

// Map the add endpoint's envelope (`PUT /api/sessions/{id}/warm-up`) onto a result.
export function toAddWarmUpResult(envelope: AddWarmUpEnvelope): AddWarmUpResult {
  if (envelope.success) return { ok: true };
  return { ok: false, message: envelope.error ?? WARM_UP_ADD_FALLBACK_ERROR };
}

export interface WarmUpPreviewRow {
  key: string;
  name: string;
  amount: string;
  load: string;
}

export interface WarmUpPreview {
  summary: string;
  rows: WarmUpPreviewRow[];
}

function drillAmount(quantity: Quantity, reps: string): string {
  if (quantity.kind === "duration" && quantity.seconds != null) return `${quantity.seconds} s`;
  if (quantity.kind === "repetitions" && quantity.count != null) return `${quantity.count} reps`;
  return reps;
}

// The preview rows: drill name, reps or seconds, and the Load label.
export function warmUpPreview(suggestion: WarmUpSuggestion, unit: WeightUnit): WarmUpPreview {
  const count = suggestion.drills.length;
  return {
    summary: `${count} ${count === 1 ? "drill" : "drills"} · about ${suggestion.estimated_minutes} min`,
    rows: suggestion.drills.map((drill, index) => ({
      key: `${index}-${drill.exercise_id}`,
      name: drill.exercise_name,
      amount: drillAmount(drill.prescribed_quantity, drill.reps),
      load: formatLoad(drill.recommended_load, unit),
    })),
  };
}
