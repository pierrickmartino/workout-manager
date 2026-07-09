import { auth } from "@clerk/nextjs/server";

import type { ExerciseSearchResult } from "./exercises-types";

// Re-export the server-free types so server-side callers can import them from
// "@/lib/exercises". Client Components must import them directly from
// "@/lib/exercises-types" to avoid pulling this server-only module into the bundle.
export * from "./exercises-types";

// Server-side data access for the Exercise Library search (Module E, ADR-0021). The
// Clerk JWT is attached here and never reaches the browser; the FastAPI backend
// verifies it via JWKS and substring-matches the shared catalog, pick-only.
const API_URL = process.env.API_URL ?? "http://localhost:8000";

interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  meta?: { total: number; limit: number; offset: number };
}

async function authHeaders(): Promise<Record<string, string>> {
  const { getToken } = await auth();
  const token = await getToken();
  return { Authorization: `Bearer ${token}` };
}

// Search the shared Exercise catalog by name substring. Returns the ranked,
// paginated matches (curated-first, then name) in the standard envelope; a query
// with no match comes back as an empty list — the library never creates an
// Exercise.
export async function searchExercises(
  query: string,
): Promise<Envelope<ExerciseSearchResult[]>> {
  const url = `${API_URL}/api/exercises?query=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: await authHeaders(),
    cache: "no-store",
  });
  return (await response.json()) as Envelope<ExerciseSearchResult[]>;
}
