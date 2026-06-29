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
