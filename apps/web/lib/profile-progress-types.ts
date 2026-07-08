// Shared Profile-progress types. This module has NO server-only imports, so it is
// safe to import from both Server and Client Components. The server-only data access
// (Clerk auth + fetch) lives in `lib/profile-progress.ts`.

// Where the account's XP sits on the Operator Level curve (F5 Slice 2). `level` is the
// account-wide tier; `xp_into_level / xp_span_of_level` is the progress-bar fill toward
// the next level, and `xp_to_next` is the XP still owed to reach it.
export interface OperatorLevel {
  level: number;
  xp_into_level: number;
  xp_span_of_level: number;
  xp_to_next: number;
}

// The honest Profile read model (F5 Slices 1–2): the account's `xp` and Operator `level`,
// the weekly `streak` — consecutive weeks ending at the current week in which at least one
// Session was logged — and the lifetime `total_sessions` / `total_sets` counts. Every
// figure is derived read-time from the user's Logged Sessions, so a brand-new user
// projects to all zeros and Level 1. This is the shared spine later F5 slices extend
// (Achievements).
export interface ProfileProgress {
  xp: number;
  level: OperatorLevel;
  streak: number;
  total_sessions: number;
  total_sets: number;
}
