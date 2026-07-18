import { apiGet, type Envelope } from "./api";

import type { ExerciseRecords } from "./exercise-stats-view";

// Re-export the server-free types so server-side callers can keep importing them from
// "@/lib/exercise-records". Client Components must import them (and `toStatTiles`) from
// "@/lib/exercise-stats-view" to avoid pulling this server-only module into the browser.
export * from "./exercise-stats-view";

// Server-side data access for the per-exercise stat header (F6 Slice 2). The transport
// seam (lib/api.ts) attaches the Clerk JWT — it never reaches the browser; the FastAPI
// backend verifies it via JWKS, scopes the read to the owning user, and derives the
// Personal Record (highest Estimated 1RM) and Total Sets from the user's Logged Sets for
// the Exercise.
export async function fetchExerciseRecords(
  exerciseId: number,
): Promise<Envelope<ExerciseRecords>> {
  return apiGet(`/api/exercises/${exerciseId}/records`);
}
