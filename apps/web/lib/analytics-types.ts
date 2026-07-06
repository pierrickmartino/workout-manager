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

// The honest count read model for one range window (F3 Slice 1–2): sessions,
// active days, total sets, and the set-count muscle distribution, drawn straight
// from the record side (Logged Sessions / Logged Sets) with no Load parsing or
// conversion. `muscle_distribution` is empty when nothing was logged.
export interface AnalyticsOverview {
  range: AnalyticsRange;
  sessions: number;
  active_days: number;
  total_sets: number;
  muscle_distribution: MuscleShare[];
}
