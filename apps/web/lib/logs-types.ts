// Shared session-logging types. This module has NO server-only imports, so it is
// safe to import from both Server and Client Components. The server-only data
// access (Clerk auth + fetch) lives in `lib/logs.ts`.

import type { Load, LoadKind } from "./load";

// The Completion Outcome (ADR-0013) a client declares on a Logged Session:
// Completed when every prescribed set was attempted, Incomplete when any was left
// un-attempted. Only a Completed log advances the Protocol to its Next Session.
export type CompletionOutcome = "completed" | "incomplete";

// One actual set the user performed within a Logged Session — the real reps,
// load, and perceived difficulty, joined to the catalog Exercise performed.
export interface LoggedSet {
  position: number;
  reps: number;
  load: Load | null;
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
  // The declared Completion Outcome, or null when the record does not declare one.
  completion_outcome: CompletionOutcome | null;
  logged_sets: LoggedSet[];
}

// A set the user submits to record. The load is captured as the picked `kind`
// plus its value field (a number for absolute/percent, a low-high pair for a
// range, added kilograms for bodyweight, free text for qualitative). The picked
// kind is authoritative — the backend types the load from it, never re-guessing.
export interface LogSetInput {
  exercise_id: number;
  reps: number;
  load_kind: LoadKind;
  load_value: string | null;
  perceived_difficulty: number | null;
}

// The request the user submits to record a performance of a Session. The
// `completion_outcome` is the client-declared verdict (ADR-0013): the Live Session
// derives it from whether every set was attempted; the static form defaults to
// `completed`.
export interface LogSessionInput {
  performed_on: string;
  completion_outcome: CompletionOutcome;
  logged_sets: LogSetInput[];
}
