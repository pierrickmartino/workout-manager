// Shared Session constants and types. This module has NO server-only imports,
// so it is safe to import from both Server and Client Components. The
// server-only data access (Clerk auth + fetch) lives in `lib/sessions.ts`.

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

// The prescription of one Exercise within a Session — the sets/reps/etc. the
// user is told to perform, joined to its catalog Exercise definition.
export interface ExercisePrescription {
  position: number;
  sets: number;
  reps: string;
  rest_seconds: number | null;
  tempo: string | null;
  recommended_load: string | null;
  exercise_id: number;
  exercise_name: string;
  exercise_description: string | null;
  targeted_muscles: string[];
  required_equipment: string[];
  provenance: string;
}

export interface WorkoutSession {
  id: number;
  clerk_user_id: string;
  training_type: string;
  duration_minutes: number;
  prescriptions: ExercisePrescription[];
}

// The request the user submits to generate a standalone Session.
export interface GenerateSessionInput {
  training_type: string;
  duration_minutes: number;
  equipment: string[];
}
