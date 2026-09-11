import { apiGet, type Envelope } from "./api";

import type { ExerciseSearchResult } from "./exercises-types";
import type {
  CatalogFacets,
  CatalogFilters,
  ExerciseUsage,
} from "./exercise-browse-types";
import { buildCatalogQuery } from "./exercise-browse-query";

// Re-export the server-free types so server-side callers can import them from
// "@/lib/exercise-browse". Client Components import them directly from
// "@/lib/exercise-browse-types" to avoid pulling this server-only module into the bundle.
export * from "./exercise-browse-types";

// Server-side data access for Browse the Catalog (ADR-0042). Each read goes through the
// transport seam (lib/api.ts), which attaches the Clerk JWT — it never reaches the browser
// — and returns the raw envelope for the caller to unwrap.

// One page of the whole Catalog for the browse surface: a blank query lists everything,
// the facets narrow it, curated → completeness → name ordering and pagination applied by
// the backend. Returns the standard paginated envelope.
export async function browseCatalog(
  filters: CatalogFilters,
  page: { limit: number; offset: number },
): Promise<Envelope<ExerciseSearchResult[]>> {
  return apiGet(`/api/exercises?${buildCatalogQuery(filters, page)}`);
}

// The facet option lists that need the server — just the Catalog's distinct equipment
// labels; Muscle Group buckets and difficulty bands are frontend constants.
export async function fetchCatalogFacets(): Promise<Envelope<CatalogFacets>> {
  return apiGet("/api/exercises/facets");
}

// The caller's per-Exercise last-performed map, read into the descriptive TRAINED / NEW
// row markers. A read-time projection over the user's Logged Sessions; kept separate from
// the Catalog read so that read stays user-agnostic.
export async function fetchExerciseUsage(): Promise<Envelope<ExerciseUsage[]>> {
  return apiGet("/api/exercises/usage");
}
