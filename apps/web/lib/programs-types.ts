// Shared Program constants and types. No server-only imports, so this is safe to
// import from both Server and Client Components. The server-only data access
// (Clerk auth + fetch) lives in `lib/programs.ts`.

import type { ExercisePrescription } from "./sessions-types";

// One Session inside a Program, fixed to a descriptive Week/Day position (no
// calendar binding). For an upcoming Session the recommended loads carry the
// deterministic Progression adjustment from the user's Logged Sets (ADR-0004).
export interface ProgramSession {
  session_id: number;
  position: number;
  week: number;
  day: number;
  title: string | null;
  prescriptions: ExercisePrescription[];
}

// The async generation job the PWA polls (Slice 7, ADR-0005). Generation runs
// off the request path: a cache hit returns `complete` with a `program_id`
// inline, while a miss/bypass returns `pending` with a `job_id` to poll until the
// adopted `program_id` appears (or `failed` with a user-safe message).
export type ProgramJobStatus = "pending" | "complete" | "failed";

export interface ProgramJob {
  status: ProgramJobStatus;
  job_id: string | null;
  program_id: number | null;
  error: string | null;
}

// The full parameter set for a multi-week Program generation request.
export interface GenerateProgramInput {
  training_type: string;
  objective: string;
  sessions_per_week: number;
  duration_minutes: number;
  weeks: number;
  equipment: string[];
}

// A user-owned multi-week Program joined to its self-paced position: the next
// un-performed Session and how many have been completed so far.
export interface ProgramProgress {
  id: number;
  clerk_user_id: string;
  training_type: string;
  objective: string;
  sessions_per_week: number;
  weeks: number;
  duration_minutes: number;
  sessions: ProgramSession[];
  next_session: ProgramSession | null;
  completed_count: number;
}
