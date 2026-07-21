import { apiGet, apiSend, type Envelope } from "./api";

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

export async function fetchSession(
  id: number,
): Promise<Envelope<WorkoutSession>> {
  return apiGet(`/api/sessions/${id}`);
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
