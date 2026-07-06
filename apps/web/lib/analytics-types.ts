// Shared Analytics types. This module has NO server-only imports, so it is safe
// to import from both Server and Client Components. The server-only data access
// (Clerk auth + fetch) lives in `lib/analytics.ts`.

// The rolling window the Analytics screen is scoped to.
export type AnalyticsRange = "7d" | "30d" | "90d";

export const ANALYTICS_RANGES: AnalyticsRange[] = ["7d", "30d", "90d"];

// Narrow an untrusted query value to a valid range, defaulting to "7d".
export function toAnalyticsRange(value: string | undefined): AnalyticsRange {
  return ANALYTICS_RANGES.includes(value as AnalyticsRange)
    ? (value as AnalyticsRange)
    : "7d";
}

// One curated Muscle Group's share of the window's set count (F3 Slice 2). `group`
// is the display label (Legs / Chest / Back / Shoulders / Arms / Core /
// Unclassified); `pct` is an exact float and the shares sum to 100 over the groups
// that received work.
export interface MuscleShare {
  group: string;
  pct: number;
}

// One Personal Record in the Recent Records feed (F3 Slice 4): the Exercise, the new
// Estimated 1RM it set, the `gain` over the Exercise's prior PR (0 for the first-ever
// record), and the ISO `date` it was performed on. Derived read-time from Logged Sets.
export interface PersonalRecordEntry {
  exercise: string;
  estimated_1rm: number;
  gain: number;
  date: string;
}

// The honest read model for one range window (F3 Slice 1–4): sessions, active days,
// total sets, and the set-count muscle distribution drawn straight from the record
// side, plus the last 8 Personal Records all-time (`recent_records`, decoupled from
// the window so it is rarely empty) and the range-scoped `new_prs` count.
// `muscle_distribution` and `recent_records` are empty when nothing qualifies.
export interface AnalyticsOverview {
  range: AnalyticsRange;
  sessions: number;
  active_days: number;
  total_sets: number;
  muscle_distribution: MuscleShare[];
  recent_records: PersonalRecordEntry[];
  new_prs: number;
}
