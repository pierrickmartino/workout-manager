import { apiGet, apiSend, type Envelope } from "./api";

import type {
  ExerciseDetail,
  GenerateSessionInput,
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
// unlimited and never consumes the regeneration limit. The POST carries no body, so
// the seam sends no `Content-Type` — preserved exactly as before.
export async function substitutePrescription(
  sessionId: number,
  position: number,
): Promise<Envelope<WorkoutSession>> {
  return apiSend(
    `/api/sessions/${sessionId}/prescriptions/${position}/substitute`,
    "POST",
  );
}
