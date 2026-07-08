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

// One evaluated Achievement (F5 Slice 3): a curated, type-neutral milestone projected
// read-time over the user's Logged history. `unlocked` is whether its predicate holds over
// the whole current record; `current`/`target` are the live progress a locked badge shows
// ("Log 25 Sessions — 18/25"); `unlocked_on` is the ISO date it was first earned, or null
// while locked. Because it is a pure projection of current logs, a badge re-locks if the
// logs behind it are deleted.
export interface Achievement {
  id: string;
  name: string;
  criteria: string;
  unlocked: boolean;
  current: number;
  target: number;
  unlocked_on: string | null;
}

// The honest Profile read model (F5 Slices 1–3): the account's `xp` and Operator `level`,
// the weekly `streak` — consecutive weeks ending at the current week in which at least one
// Session was logged — the lifetime `total_sessions` / `total_sets` counts, and the
// `achievements` wall. Every figure is derived read-time from the user's Logged Sessions,
// so a brand-new user projects to all zeros, Level 1, and an all-locked wall.
export interface ProfileProgress {
  xp: number;
  level: OperatorLevel;
  streak: number;
  total_sessions: number;
  total_sets: number;
  achievements: Achievement[];
}
