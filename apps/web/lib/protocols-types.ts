// Shared Protocol constants and types. No server-only imports, so this is safe to
// import from both Server and Client Components. The server-only data access
// (Clerk auth + fetch) lives in `lib/protocols.ts`.

import type { ExercisePrescription } from "./sessions-types";

// One Session inside a Protocol, fixed to a descriptive Week/Day position (no
// calendar binding). For an upcoming Session the recommended loads carry the
// deterministic Progression adjustment from the user's Logged Sets (ADR-0004).
export interface ProtocolSession {
  session_id: number;
  position: number;
  week: number;
  day: number;
  title: string | null;
  prescriptions: ExercisePrescription[];
}

// The async generation job the PWA polls (Slice 7, ADR-0005). Generation runs
// off the request path: a cache hit returns `complete` with a `protocol_id`
// inline, while a miss/bypass returns `pending` with a `job_id` to poll until the
// adopted `protocol_id` appears (or `failed` with a user-safe message).
export type ProtocolJobStatus = "pending" | "complete" | "failed";

export interface ProtocolJob {
  status: ProtocolJobStatus;
  job_id: string | null;
  protocol_id: number | null;
  error: string | null;
}

// The full parameter set for a multi-week Protocol generation request.
export interface GenerateProtocolInput {
  training_type: string;
  objective: string;
  sessions_per_week: number;
  duration_minutes: number;
  weeks: number;
  equipment: string[];
}

// A user-owned multi-week Protocol joined to its self-paced position: the next
// un-performed Session and how many have been completed so far.
export interface ProtocolProgress {
  id: number;
  clerk_user_id: string;
  training_type: string;
  objective: string;
  sessions_per_week: number;
  weeks: number;
  duration_minutes: number;
  sessions: ProtocolSession[];
  next_session: ProtocolSession | null;
  completed_count: number;
}
