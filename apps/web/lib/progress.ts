import { auth } from "@clerk/nextjs/server";

import type { ExerciseProgress } from "./progress-types";

// Re-export the server-free types so server-side callers can keep importing them
// from "@/lib/progress". Client Components must import them directly from
// "@/lib/progress-types" to avoid pulling this server-only module into the browser.
export * from "./progress-types";

// Server-side data access for per-exercise progress. The Clerk JWT is attached
// here and never reaches the browser; the FastAPI backend verifies it via JWKS,
// scopes the read to the owning user, and projects the user's Logged Sets onto a
// single Exercise as an oldest-first time series.
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

export async function fetchExerciseProgress(
  exerciseId: number,
): Promise<Envelope<ExerciseProgress>> {
  const response = await fetch(
    `${API_URL}/api/exercises/${exerciseId}/progress`,
    {
      headers: await authHeaders(),
      cache: "no-store",
    },
  );
  return (await response.json()) as Envelope<ExerciseProgress>;
}
