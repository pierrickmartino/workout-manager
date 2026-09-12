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
  // The broad Movement Pattern (ADR-0072), a read-time projection the backend classifies
  // from the movement's name and muscles. Present on the browse/taxonomy projection so a
  // row and its field-guide section agree on the family. A raw wire token ("squat" …
  // "general"); the client resolves it via `parseMovementPattern`.
  movement_pattern: string;
}
