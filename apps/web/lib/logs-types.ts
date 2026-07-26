// Shared session-logging types. This module has NO server-only imports, so it is
// safe to import from both Server and Client Components. The server-only data
// access (Clerk auth + fetch) lives in `lib/logs.ts`.

import type { Load, LoadKind } from "./load";
import type { Quantity, QuantityKind } from "./quantity";

// The Completion Outcome (ADR-0013) a client declares on a Logged Session:
// Completed when every prescribed set was attempted, Incomplete when any was left
// un-attempted. Only a Completed log advances the Protocol to its Next Session.
export type CompletionOutcome = "completed" | "incomplete";

// One actual set the user performed within a Logged Session — the real amount
// (a typed Quantity, ADR-0032), load, and perceived difficulty, joined to the catalog
// Exercise performed.
export interface LoggedSet {
  position: number;
  quantity: Quantity | null;
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
  // The recorded Session Duration in whole seconds (ADR-0014), or null when the
  // performance was not live-tracked (e.g. logged after the fact through the form).
  duration_seconds: number | null;
  logged_sets: LoggedSet[];
}

// A set the user submits to record. The amount is captured as a typed Quantity
// (ADR-0032): `quantity_kind` is the picked kind (the log form sends `repetitions`)
// and `quantity_value` its value field. The load is captured the same way — the picked
// `load_kind` plus its `load_value`. Each picked kind is authoritative, so the backend
// types the set from it at the write boundary, never re-guessing the raw value.
export interface LogSetInput {
  exercise_id: number;
  quantity_kind: QuantityKind;
  quantity_value: string | null;
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
  // The recorded Session Duration in whole seconds (ADR-0014). Optional and nullable:
  // the Live Session sends start → last-activity time; the static form omits it.
  duration_seconds?: number | null;
  logged_sets: LogSetInput[];
}

// The request the user submits to record a plan-less performance (ADR-0031) — an
// ad-hoc log posted to `/api/logs` with no Session behind it. The `training_type`
// rides on the record (there is no Session to read it from); a Completion Outcome is
// deliberately absent — an ad-hoc record gates no Protocol and declares none.
export interface LogAdhocInput {
  performed_on: string;
  training_type: string;
  logged_sets: LogSetInput[];
}
