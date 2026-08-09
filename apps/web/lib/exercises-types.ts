// Shared Exercise Library types. No server-only imports, so this is safe to import
// from both Server and Client Components. The server-only data access (Clerk auth +
// fetch) lives in `lib/exercises.ts`.

// One catalog match as the Exercise Library surfaces it (Module E, ADR-0021). This
// is the pick-only projection: just enough to choose a movement and know if it is
// unvalidated. `provenance` is surfaced exactly as the Session view and Exercise
// Detail do.
export interface ExerciseSearchResult {
  id: number;
  name: string;
  targeted_muscles: string[];
  required_equipment: string[];
  difficulty: number | null;
  provenance: string;
  // Catalog Completeness (ADR-0041): the read-time Stub | Listable | Enriched tier,
  // a content-presence axis distinct from `provenance` (trust). Surfaced beside the
  // Provenance marker on each Library result.
  completeness: string;
}
