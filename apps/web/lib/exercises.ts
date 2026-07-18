import { apiGet, type Envelope } from "./api";

import type { ExerciseSearchResult } from "./exercises-types";

// Re-export the server-free types so server-side callers can import them from
// "@/lib/exercises". Client Components must import them directly from
// "@/lib/exercises-types" to avoid pulling this server-only module into the bundle.
export * from "./exercises-types";

// Server-side data access for the Exercise Library search (Module E, ADR-0021). The
// transport seam (lib/api.ts) attaches the Clerk JWT — it never reaches the browser;
// the FastAPI backend verifies it via JWKS and substring-matches the shared catalog,
// pick-only.

// Search the shared Exercise catalog by name substring. Returns the ranked,
// paginated matches (curated-first, then name) in the standard envelope; a query
// with no match comes back as an empty list — the library never creates an
// Exercise. The query string is encoded here, where its URL semantics live.
export async function searchExercises(
  query: string,
): Promise<Envelope<ExerciseSearchResult[]>> {
  return apiGet(`/api/exercises?query=${encodeURIComponent(query)}`);
}
