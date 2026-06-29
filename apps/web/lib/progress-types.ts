// Shared per-exercise progress types. This module has NO server-only imports, so
// it is safe to import from both Server and Client Components. The server-only
// data access (Clerk auth + fetch) lives in `lib/progress.ts`.

// One actual set within a logged performance, as surfaced on the progress view —
// the real reps, load, and perceived difficulty the user did.
export interface ExerciseProgressSet {
  position: number;
  reps: number;
  load: string | null;
  perceived_difficulty: number | null;
}

// One performance of an Exercise: the date it was done and the sets done that day.
export interface ExerciseProgressPoint {
  logged_session_id: number;
  performed_on: string;
  sets: ExerciseProgressSet[];
}

// A single Exercise's logged history as an oldest-first time series of points,
// drawn purely from the record side (Logged Sessions / Logged Sets).
export interface ExerciseProgress {
  exercise_id: number;
  exercise_name: string;
  points: ExerciseProgressPoint[];
}
