// Shared session-logging types. This module has NO server-only imports, so it is
// safe to import from both Server and Client Components. The server-only data
// access (Clerk auth + fetch) lives in `lib/logs.ts`.

// One actual set the user performed within a Logged Session — the real reps,
// load, and perceived difficulty, joined to the catalog Exercise performed.
export interface LoggedSet {
  position: number;
  reps: number;
  load: string | null;
  perceived_difficulty: number | null;
  exercise_id: number;
  exercise_name: string;
}

// A record of the user performing a Session on a date. One Session can have many
// Logged Sessions; each is a separate performance and never mutates the plan.
export interface LoggedSession {
  id: number;
  clerk_user_id: string;
  session_id: number;
  training_type: string;
  performed_on: string;
  logged_sets: LoggedSet[];
}

export interface LogSetInput {
  exercise_id: number;
  reps: number;
  load: string | null;
  perceived_difficulty: number | null;
}

// The request the user submits to record a performance of a Session.
export interface LogSessionInput {
  performed_on: string;
  logged_sets: LogSetInput[];
}
