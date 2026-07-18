import { apiGet, type Envelope } from "./api";

import type { ExerciseProgress } from "./progress-types";

// Re-export the server-free types so server-side callers can keep importing them
// from "@/lib/progress". Client Components must import them directly from
// "@/lib/progress-types" to avoid pulling this server-only module into the browser.
export * from "./progress-types";

// Server-side data access for per-exercise progress. The transport seam (lib/api.ts)
// attaches the Clerk JWT — it never reaches the browser; the FastAPI backend verifies
// it via JWKS, scopes the read to the owning user, and projects the user's Logged Sets
// onto a single Exercise as an oldest-first time series.
export async function fetchExerciseProgress(
  exerciseId: number,
): Promise<Envelope<ExerciseProgress>> {
  return apiGet(`/api/exercises/${exerciseId}/progress`);
}
