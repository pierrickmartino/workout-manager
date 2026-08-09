// Shared Session constants and types. This module has NO server-only imports,
// so it is safe to import from both Server and Client Components. The
// server-only data access (Clerk auth + fetch) lives in `lib/sessions.ts`.

import type { Load } from "./load";
import type { SuggestedVariation } from "./harder-variation-view";

// Training types a Session can be generated for. Mirrors the Fitness Level
// dimensions used elsewhere in the app.
export const TRAINING_TYPES = [
  "strength",
  "cardio",
  "hiit",
  "yoga",
  "mobility",
] as const;

export type TrainingType = (typeof TRAINING_TYPES)[number];

// One set of an Exercise's previous performance — the reps and load the user did
// last time, surfaced on the live screen as the reference to beat (issue #90).
export interface PreviousSet {
  reps: number;
  load: Load | null;
}

// The prescription of one Exercise within a Session — the sets/reps/etc. the
// user is told to perform, joined to its catalog Exercise definition.
export interface ExercisePrescription {
  position: number;
  sets: number;
  reps: string;
  rest_seconds: number | null;
  tempo: string | null;
  recommended_load: Load | null;
  // Superset overlay (ADR-0023): the group tag members of one Superset share and the
  // group-owned round-rest. Both null on a flat, solo Prescription. Optional here like
  // `previous_performance` — the Protocol/Builder read always carries them (the server
  // serializes them on every Prescription), while pre-Superset read paths need not.
  superset_group?: string | null;
  round_rest_seconds?: number | null;
  exercise_id: number;
  exercise_name: string;
  exercise_description: string | null;
  targeted_muscles: string[];
  required_equipment: string[];
  provenance: string;
  // The Exercise's most recent Logged Sets, aligned to this prescription's sets by
  // ordinal. Present only on the live hydration read (issue #90); omitted on the
  // plain Session read, so it is optional. Empty when the Exercise was never logged.
  previous_performance?: PreviousSet[];
}

export interface WorkoutSession {
  id: number;
  clerk_user_id: string;
  training_type: string;
  duration_minutes: number;
  has_been_regenerated: boolean;
  // Session Provenance (ADR-0040): how the plan came to exist — `ai_generated` or
  // `user_authored`. Gates the AI-only affordances (Generation Feedback, Regeneration)
  // via `aiAffordanceVisibility`. Optional here because the plain Session read always
  // carries it while the live hydration read omits it (mirror of `previous_performance`).
  provenance?: string;
  prescriptions: ExercisePrescription[];
}

// The harder-Variation offer read for one Prescription (#202): the catalog
// Exercise to advance to at the pure-bodyweight rep ceiling, or `null` when there
// is none on file and the prescription holds. The client feeds `suggested_variation`
// to `toHarderVariationOffer` (lib/harder-variation-view) to build the display model.
export interface HarderVariationResponse {
  suggested_variation: SuggestedVariation | null;
}

// A short reference to a related catalog Exercise (a Variation or Alternative),
// as returned on an Exercise's detail.
export interface RelatedExerciseSummary {
  id: number;
  name: string;
}

// The enriched detail of a single catalog Exercise, plus its typed relationships
// split into Variations (same movement, scaled) and Alternatives (same effect).
export interface ExerciseDetail {
  id: number;
  name: string;
  description: string | null;
  provenance: string;
  // The flat, durable muscle union the analytics roll-up reads (ADR-0011), plus the
  // Primary/Secondary emphasis split layered on top (ADR-0016). The split is empty
  // when the Exercise asserts no primacy; the SPECS map falls back to the union then.
  targeted_muscles: string[];
  primary_muscles: string[];
  secondary_muscles: string[];
  required_equipment: string[];
  // Ordered Execution Steps (ADR-0015): one entry per authored step, never a prose
  // blob. Rendered numbered (2+) or as a single un-numbered block.
  instructions: string[];
  difficulty: number | null;
  precautions: string[];
  // Catalog Completeness (ADR-0041): the read-time Stub | Listable | Enriched tier,
  // a content-presence axis distinct from `provenance` (trust). Shown beside the
  // Provenance marker in the Detail header.
  completeness: string;
  variations: RelatedExerciseSummary[];
  alternatives: RelatedExerciseSummary[];
}

// The request the user submits to generate a standalone Session.
export interface GenerateSessionInput {
  training_type: string;
  duration_minutes: number;
  equipment: string[];
}
