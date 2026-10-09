// Shared Profile-progress types. This module has NO server-only imports, so it is
// safe to import from both Server and Client Components. The server-only data access
// (Clerk auth + fetch) lives in `lib/profile-progress.ts`.

import type { PersonalRecordEntry } from "./analytics-types";
import type { Load } from "./load";

// Where the account's XP sits on the Operator Level curve (F5 Slice 2). `level` is the
// account-wide tier; `xp_into_level / xp_span_of_level` is the progress-bar fill toward
// the next level, and `xp_to_next` is the XP still owed to reach it.
export interface OperatorLevel {
  level: number;
  xp_into_level: number;
  xp_span_of_level: number;
  xp_to_next: number;
}

// The lift behind the First Record Achievement (#653): the shared Personal Record shape
// (`exercise` … `added_kg`, ADR-0026), plus the Exercise's id and the set's typed `load` and
// Performed Body Weight (`body_weight_kg`, kg). `body_weight_kg` is null for an absolute record
// and for a bodyweight one logged without a body weight on file.
export interface AchievementRecord extends PersonalRecordEntry {
  exercise_id: number;
  load: Load | null;
  body_weight_kg: number | null;
}

// One evaluated Achievement (F5 Slice 3): a curated, type-neutral milestone projected
// read-time over the user's Logged history. `unlocked` is whether its predicate holds over
// the whole current record; `current`/`target` are the live progress a locked badge shows
// ("Log 25 Sessions — 18/25"); `unlocked_on` is the ISO date it was first earned and
// `unlocked_by_session_id` the Logged Session whose logging crossed the target (#652), both
// null while locked. Only First Record carries `record`: its lift, or null while locked; every
// other Achievement omits the key. Because it is a pure projection of current logs, a badge
// re-locks if the logs behind it are deleted.
export interface Achievement {
  id: string;
  name: string;
  criteria: string;
  unlocked: boolean;
  current: number;
  target: number;
  unlocked_on: string | null;
  unlocked_by_session_id: number | null;
  record?: AchievementRecord | null;
}

// One Training Type's Fitness Level read both ways (ADR-0112). `declared` is the stored
// Declared Fitness Level the user states about themselves on their Fitness Profile;
// `effective` is the Effective Fitness Level the app actually plans with — the Declared level
// plus net evidence from a window of recent Logged Sessions of that type, never below
// Declared. Served from the progress read model and deliberately never from the Profile
// endpoint, whose `fitness_levels` field the Profile form writes back. The two figures are
// equal far more often than not, and that case is a row like any other.
export interface FitnessLevelStanding {
  training_type: string;
  declared: number;
  effective: number;
}

// The honest Profile read model (F5 Slices 1–3): the account's `xp` and Operator `level`,
// the weekly `streak` — consecutive weeks ending at the current week in which at least one
// Session was logged — the lifetime `total_sessions` / `total_sets` counts, and the
// `achievements` wall, and one `fitness_levels` standing per *declared* Training Type. Every
// figure is derived read-time from the user's Logged Sessions, so a brand-new user projects to
// all zeros, Level 1, an all-locked wall, and every standing at exactly its Declared level.
export interface ProfileProgress {
  xp: number;
  level: OperatorLevel;
  streak: number;
  total_sessions: number;
  total_sets: number;
  achievements: Achievement[];
  fitness_levels: FitnessLevelStanding[];
}
