// Shared Profile-progress types. This module has NO server-only imports, so it is
// safe to import from both Server and Client Components. The server-only data access
// (Clerk auth + fetch) lives in `lib/profile-progress.ts`.

// The honest Profile read model (F5 Slice 1): the weekly `streak` — consecutive weeks
// ending at the current week in which at least one Session was logged — and the
// lifetime `total_sessions` / `total_sets` counts. Every figure is derived read-time
// from the user's Logged Sessions, so a brand-new user projects to all zeros. This is
// the shared spine later F5 slices extend (XP + Operator Level, Achievements).
export interface ProfileProgress {
  streak: number;
  total_sessions: number;
  total_sets: number;
}
