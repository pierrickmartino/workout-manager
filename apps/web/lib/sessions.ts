import { apiGet, apiSend, type Envelope } from "./api";

import type {
  AuthorPlanInput,
  AuthorPrescriptionInput,
  AuthorSessionInput,
} from "./hand-authored-session";
import type { LoggedSession } from "./logs-types";
import type { SessionSummary } from "./session-library";
import type {
  ExerciseDetail,
  GenerateSessionInput,
  HarderVariationResponse,
  ShareLink,
  SharePreview,
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

// The generous first-page size the My Sessions library fetches (issue #397): the whole
// personal library in one read so search + favorites filtering run entirely in-browser (like
// History), bounded by the server's own list cap. A library larger than this would need
// pagination UI — out of scope for v1's personal library.
const LIBRARY_PAGE_LIMIT = 100;

// List the user's own standalone Sessions for the My Sessions library (CONTEXT: My Sessions,
// issue #397). The backend is owner-scoped and standalone-only — a Protocol-member Session and
// every other user's Session are excluded — and returns the thin per-row projection
// (name/fallback, Training Type, Author, favorite state). The page fetches the whole first
// page and does the search + favorites filtering client-side via `session-library`.
export async function fetchSessions(): Promise<Envelope<SessionSummary[]>> {
  return apiGet(`/api/sessions?limit=${LIBRARY_PAGE_LIMIT}`);
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

// Permanently delete the user's own standalone Session (Delete, CONTEXT: Delete, ADR-0063): a
// hard delete of the plan and its plan-side dependents — Prescriptions, the Favorite marker,
// Generation Feedback, and Share Links. Offered only on a Session with no logged training. A
// bodyless DELETE, so the seam sends no `Content-Type` (ADR-0022). The backend re-checks the
// guard authoritatively: 409 when the Session has any Logged Session (a performed plan is settled
// record) or is a Protocol member (standalone-only), 404 for a non-owner. On success the envelope
// carries the deleted id.
export async function deleteSession(
  id: number,
): Promise<Envelope<{ id: number }>> {
  return apiSend(`/api/sessions/${id}`, "DELETE");
}

// Rename the user's own standalone Session (issue #394): set, edit, or clear its
// user-given Session Name. `name` is the new name, or `null` to clear it back to
// born-unnamed (the read then falls back to the derived `training_type · date` label).
// Renaming touches the plan only — no Logged Session is rewritten (ADR-0001). The backend
// returns 404 for a non-owner and 409 for a Protocol-member Session (Session Name is
// standalone-only); on success the updated Session view comes back with its new
// `name`/`display_name`.
export async function renameSession(
  id: number,
  name: string | null,
): Promise<Envelope<WorkoutSession>> {
  return apiSend(`/api/sessions/${id}/name`, "PUT", { name });
}

// Mark the user's own standalone Session as a Favorite (CONTEXT: Favorite, issue #396): a
// stored, per-user, per-copy marker, private to the user and never carried across Duplicate.
// Bodyless POST, so the seam sends no `Content-Type` (ADR-0022). The backend returns 404 for a
// non-owner and 409 for a Protocol-member Session (Favorite is standalone-only); on success the
// updated Session view comes back with `is_favorite: true`. Idempotent.
export async function favoriteSession(
  id: number,
): Promise<Envelope<WorkoutSession>> {
  return apiSend(`/api/sessions/${id}/favorite`, "POST");
}

// Un-favorite the user's own standalone Session — the mark's inverse (issue #396). Clears the
// owner's Favorite marker. A bodyless DELETE, so the seam sends no `Content-Type` (ADR-0022).
// Same 404/409 surface as `favoriteSession`; on success the updated Session view comes back with
// `is_favorite: false`. Idempotent.
export async function unfavoriteSession(
  id: number,
): Promise<Envelope<WorkoutSession>> {
  return apiSend(`/api/sessions/${id}/favorite`, "DELETE");
}

// Publish (or re-publish) a Share Link on the user's own standalone Session (Share, ADR-0057,
// issue #398): a revocable, reusable token another user redeems into their own copy. Bodyless
// POST, so the seam sends no `Content-Type` (ADR-0022). Idempotent while a link is live — the
// backend returns the same active token. 404 for a non-owner, 409 for a Protocol member (a Share
// Link is standalone-only). On success the envelope carries the token and the shared Session id.
export async function createShareLink(
  id: number,
): Promise<Envelope<ShareLink>> {
  return apiSend(`/api/sessions/${id}/share`, "POST");
}

// Revoke the user's own Share Link for this Session — the sharer's off-switch (ADR-0057, issue
// #398). Stops future Redeems only; copies already taken are independent and untouched. A bodyless
// DELETE (no `Content-Type`, ADR-0022). Idempotent. 404 for a non-owner; on success the envelope
// reports the Session id and the now-revoked state.
export async function revokeShareLink(
  id: number,
): Promise<Envelope<{ session_id: number; is_revoked: boolean }>> {
  return apiSend(`/api/sessions/${id}/share`, "DELETE");
}

// Preview a Share Link without redeeming (ADR-0057, issue #398): the linked Session's Name,
// Training Type, Author and validity — nothing more. Always succeeds (validity is a field): a
// revoked or unknown token comes back `valid: false` with null details. The recipient is
// identified by their JWT; the token is the capability.
export async function previewShare(
  token: string,
): Promise<Envelope<SharePreview>> {
  return apiGet(`/api/shares/${encodeURIComponent(token)}`);
}

// Redeem a Share Link into a new standalone Session the caller owns (Redeem, ADR-0057, issue
// #398): a redeem-time deep-copy of the shared plan — Author preserved, Name/Provenance/lineage
// carried, no records, no Protocol position, not favorited. Bodyless POST. The response is the
// new Session (the same shape as the plain read), so the caller lands on their own copy. A
// revoked or unknown link comes back as an envelope error (404).
export async function redeemShare(
  token: string,
): Promise<Envelope<WorkoutSession>> {
  return apiSend(`/api/shares/${encodeURIComponent(token)}/redeem`, "POST");
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

// Pin a user-set bodyweight rep target onto the prescription at `position` in the user's own
// Session (ADR-0053, #369). From this write on, automatic read-time Progression stops adjusting
// that movement — the plan surfaces the pinned range verbatim — until it is un-pinned. `reps` is
// the range text ("12" or "10-14"); the backend validates it and refuses a performed Session (409)
// or a non-owned/absent prescription (404). On success the updated Session view comes back, its
// Provenance unchanged. Sibling of `substitutePrescription` in shape and error surface.
export async function pinPrescription(
  sessionId: number,
  position: number,
  reps: string,
): Promise<Envelope<WorkoutSession>> {
  return apiSend(
    `/api/sessions/${sessionId}/prescriptions/${position}/pin`,
    "POST",
    { reps },
  );
}

// Un-pin the prescription at `position` — Pin's inverse (ADR-0053, #369). Clears the pinned
// marker so automatic Progression resumes from the latest logs with no lingering effect. A
// bodyless DELETE, so the seam sends no `Content-Type` (ADR-0022). Same 404/409 surface as
// `pinPrescription`; on success the updated Session view comes back.
export async function unpinPrescription(
  sessionId: number,
  position: number,
): Promise<Envelope<WorkoutSession>> {
  return apiSend(
    `/api/sessions/${sessionId}/prescriptions/${position}/pin`,
    "DELETE",
  );
}
