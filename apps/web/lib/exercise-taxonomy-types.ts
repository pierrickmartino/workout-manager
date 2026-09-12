// Shared field-guide taxonomy types (ADR-0072). No server-only imports, so this is safe
// to pull into Client Components; the server-side data access (Clerk auth + fetch) lives
// in `lib/exercise-browse.ts`.

import type { ExerciseSearchResult } from "./exercises-types";

// One Movement Pattern section of the Catalog taxonomy: the wire pattern token, the
// accurate count of matching exercises across the whole filtered catalog (not just a
// page), and the ranked exercises themselves.
export interface CatalogTaxonomyGroup {
  pattern: string;
  count: number;
  exercises: ExerciseSearchResult[];
}

// The whole Catalog grouped by Movement Pattern for the current filters, in canonical
// order (General last), with empty patterns omitted, plus the total across all groups.
export interface CatalogTaxonomy {
  groups: CatalogTaxonomyGroup[];
  total: number;
}

// The unwrapped taxonomy result a server action hands the client — the grouped data plus
// an `error` the client renders instead of the sections when the read fails.
export interface CatalogTaxonomyResult {
  taxonomy: CatalogTaxonomy;
  error: string | null;
}
