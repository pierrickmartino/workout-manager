import { auth } from "@clerk/nextjs/server";

import type { ExerciseRecords } from "./exercise-stats-view";

// Re-export the server-free types so server-side callers can keep importing them from
// "@/lib/exercise-records". Client Components must import them (and `toStatTiles`) from
// "@/lib/exercise-stats-view" to avoid pulling this server-only module into the browser.
export * from "./exercise-stats-view";

// Server-side data access for the per-exercise stat header (F6 Slice 2). The Clerk JWT
// is attached here and never reaches the browser; the FastAPI backend verifies it via
// JWKS, scopes the read to the owning user, and derives the Personal Record (highest
// Estimated 1RM) and Total Sets from the user's Logged Sets for the Exercise.
const API_URL = process.env.API_URL ?? "http://localhost:8000";

interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { getToken } = await auth();
  const token = await getToken();
  return { Authorization: `Bearer ${token}` };
}

export async function fetchExerciseRecords(
  exerciseId: number,
): Promise<Envelope<ExerciseRecords>> {
  const response = await fetch(
    `${API_URL}/api/exercises/${exerciseId}/records`,
    {
      headers: await authHeaders(),
      cache: "no-store",
    },
  );
  return (await response.json()) as Envelope<ExerciseRecords>;
}
