import { apiGet, apiSend, type Envelope } from "./api";

import type {
  AuthorPlanInput,
  AuthorPrescriptionInput,
  AuthorSessionInput,
} from "./hand-authored-session";
import type { LoggedSession } from "./logs-types";
import type {
  ExerciseDetail,
  GenerateSessionInput,
  HarderVariationResponse,
  WorkoutSession,
} from "./sessions-types";

// Re-export the server-free constants/types so existing server-side callers can
// keep importing them from "@/lib/sessions". Client Components must import them
// directly from "@/lib/sessions-types" to avoid pulling this server-only module
// (and its `server-only` dependency) into the browser bundle.
export * from "./sessions-types";

// Server-side data access for standalone Session generation. The transport seam
// (lib/api.ts) attaches the Clerk JWT — it never reaches the browser; the FastAPI
// backend verifies it via JWKS, then runs the AI generation path (ADR-0006).
export async function generateSession(
  input: GenerateSessionInput,
): Promise<Envelope<WorkoutSession>> {
  return apiSend("/api/sessions/generate", "POST", input);
}

// Author-and-log a Hand-Authored Session (ADR-0040, issue #287): one POST creates a
// standalone `user_authored` Session (the plan) and records its first Logged Session
// (the record) atomically. The response is the created Logged Session, so the caller can
// jump to it in History. A rejected request comes back as an envelope error.
export async function authorSession(
  input: AuthorSessionInput,
): Promise<Envelope<LoggedSession>> {
  return apiSend("/api/sessions", "POST", input);
}

export async function fetchSession(
  id: number,
): Promise<Envelope<WorkoutSession>> {
  return apiGet(`/api/sessions/${id}`);
}

// Append one hand-authored Exercise Prescription to the user's own standalone Session
// (Insert, ADR-0051, issue #360): the client has mapped the "Add exercise" editor into the
// single-prescription payload through `buildInsertPrescriptionRequest`, so this is a thin
// transport shell. The backend validates through `validate_deploy`, appends the prescription
// last (no AI call), and returns the updated Session — its Provenance unchanged and its
// Logged Sessions frozen. A Protocol-member target or a validation failure comes back as an
// envelope error (nothing persisted); a non-owner Session 404s.
export async function insertPrescription(
  sessionId: number,
  input: AuthorPrescriptionInput,
): Promise<Envelope<WorkoutSession>> {
  return apiSend(`/api/sessions/${sessionId}/prescriptions`, "POST", input);
}

// Remove one Exercise Prescription from the user's own standalone Session (Remove,
// ADR-0052, Insert's symmetric partner): a bodyless DELETE at the prescription's position,
// so the seam sends no `Content-Type` (ADR-0022). The backend drops the prescription with
// no AI call, re-numbers the survivors contiguous, dissolves any Superset left with a
// single member, and returns the updated Session — its Provenance unchanged and its Logged
// Sessions frozen. A Protocol-member target or the last-remaining prescription comes back
// as an envelope error (nothing persisted); a non-owner Session or a missing position 404s.
export async function removePrescription(
  sessionId: number,
  position: number,
): Promise<Envelope<WorkoutSession>> {
  return apiSend(
    `/api/sessions/${sessionId}/prescriptions/${position}`,
    "DELETE",
  );
}

// Author a standalone plan **without logging** — the submit target of Capture (ADR-0044).
// Posts the finalized prescriptions to `/api/sessions/plan`; the backend creates a
// `user_authored` standalone Session and records no performance (the source record already
// exists). The response is the new standalone Session, so the caller can jump to it. A
// rejected plan comes back as an envelope error.
export async function authorPlan(
  input: AuthorPlanInput,
): Promise<Envelope<WorkoutSession>> {
  return apiSend("/api/sessions/plan", "POST", input);
}

// Duplicate the user's own Session into a new standalone Session (ADR-0043): a deep
// copy of the plan — prescriptions, Supersets, Provenance, and lineage — with no
// records and no Protocol position, so the copy stands alone. The response is the new
// standalone Session; the backend returns 404 for a non-owner. Bodyless POST, so the
// seam sends no `Content-Type` (ADR-0022). Unlimited.
export async function duplicateSession(
  id: number,
): Promise<Envelope<WorkoutSession>> {
  return apiSend(`/api/sessions/${id}/duplicate`, "POST");
}

// Hydration read for the Live Session screen (issue #90 — F2·S5): the owner's
// Session with recommended loads progression-adjusted (ADR-0004) and each Exercise
// carrying its previous performance to beat. The backend returns 404 for
// non-owners, exactly like the plain Session read.
export async function fetchLiveSession(
  id: number,
): Promise<Envelope<WorkoutSession>> {
  return apiGet(`/api/sessions/${id}/live`);
}

export async function fetchExercise(
  id: number,
): Promise<Envelope<ExerciseDetail>> {
  return apiGet(`/api/exercises/${id}`);
}

// Substitute the Exercise prescribed at ``position`` in the user's own Session
// copy. Lookup-first over the catalog, AI fallback only when nothing fits; it is
// unlimited and never consumes the regeneration limit. Called without
// ``targetExerciseId`` the POST carries no body, so the seam sends no
// `Content-Type` — preserved exactly as before. Passing ``targetExerciseId`` names
// a specific catalog Variation/Alternative to advance to — e.g. accepting the
// harder-Variation offer at the rep ceiling (#202) — sent as `target_exercise_id`.
export async function substitutePrescription(
  sessionId: number,
  position: number,
  targetExerciseId?: number,
): Promise<Envelope<WorkoutSession>> {
  const path = `/api/sessions/${sessionId}/prescriptions/${position}/substitute`;
  if (targetExerciseId === undefined) {
    return apiSend(path, "POST");
  }
  return apiSend(path, "POST", { target_exercise_id: targetExerciseId });
}

// Read the harder-Variation offer for one Prescription (#202): the next harder
// Variation to advance to when a pure-bodyweight prescription has hit its rep
// ceiling and is still hitting it easily, or `{ suggested_variation: null }` when
// there is none. Read-only; accepting is a `substitutePrescription` POST with the
// returned `exercise_id` as `target_exercise_id`.
export async function fetchHarderVariation(
  sessionId: number,
  position: number,
): Promise<Envelope<HarderVariationResponse>> {
  return apiGet(
    `/api/sessions/${sessionId}/prescriptions/${position}/harder-variation`,
  );
}
