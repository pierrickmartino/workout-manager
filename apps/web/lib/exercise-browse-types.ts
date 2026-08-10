// Shared Browse-the-Catalog types and facet constants (ADR-0042). No server-only
// imports, so this is safe to pull into Client Components; the server-side data access
// (Clerk auth + fetch) lives in `lib/exercise-browse.ts`.

import type { ExerciseSearchResult } from "./exercises-types";

// The active filter state of the Browse surface. `query` is the name substring; the
// three facet arrays hold the currently-selected values (empty = no filter). Facets AND
// together, OR within each (ADR-0042).
export interface CatalogFilters {
  query: string;
  muscleGroups: string[];
  equipment: string[];
  difficulty: string[];
}

// One page of browse results plus the full filtered count, as the server action returns
// it — the client appends `results` on "Load more" and compares the running length to
// `total` to decide whether the button still shows.
export interface CatalogPageResult {
  results: ExerciseSearchResult[];
  total: number;
  error: string | null;
}

// The facet option lists that need the server. Only equipment does — it is free-form in
// the Catalog — so the Muscle Group buckets and difficulty bands below stay frontend
// constants (ADR-0042).
export interface CatalogFacets {
  equipment: string[];
}

// One entry of the caller's per-Exercise last-performed map, powering the descriptive
// TRAINED / NEW marker. `last_performed_on` is an ISO (YYYY-MM-DD) date.
export interface ExerciseUsage {
  exercise_id: number;
  last_performed_on: string;
}

// The curated six Muscle Group buckets the facet filters by — never Unclassified, which
// is not a coverage target (ADR-0025). Labels match the backend `MuscleGroup` values.
export const MUSCLE_GROUPS = [
  "Legs",
  "Chest",
  "Back",
  "Shoulders",
  "Arms",
  "Core",
] as const;

export interface DifficultyBandOption {
  value: string;
  label: string;
}

// The three coarse difficulty bands over the stored 1–10 (ADR-0042). `value` is the
// backend band key; `label` is the chip text.
export const DIFFICULTY_BANDS: DifficultyBandOption[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

// How many movements one browse page holds; the "Load more" step (ADR-0042). Stays at or
// below the backend's MAX_SEARCH_LIMIT (50).
export const CATALOG_PAGE_SIZE = 20;
