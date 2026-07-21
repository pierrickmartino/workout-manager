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
// The set descriptor — `reps`, `is_bodyweight`, and any `added_kg` — lets a bodyweight
// record render as the set that achieved it, never a kilogram headline (ADR-0026);
// `added_kg` is `null` for an absolute record and for a pure bodyweight one.
export interface PersonalRecordEntry {
  exercise: string;
  estimated_1rm: number;
  gain: number;
  date: string;
  reps: number;
  is_bodyweight: boolean;
  added_kg: number | null;
}

// One day's total converted volume (F3 Slice 5): the ISO `date` it was performed on
// and the kg `volume_kg` moved that day. Only days with convertible (absolute/range)
// volume appear; the series is ascending by date.
export interface VolumePoint {
  date: string;
  volume_kg: number;
}

// The total-volume line for one window (F3 Slice 5): the daily `points`, the
// `coverage` percentage of logged reps the line actually converted (bodyweight and
// %-1RM sets are not yet convertible and sit in the uncovered remainder), and the
// `delta` percent against the immediately preceding equal-length window — `null` when
// there is no prior volume to compare against. `points` is empty when nothing converts.
export interface VolumeSeries {
  points: VolumePoint[];
  coverage: number;
  delta: number | null;
}

// One real Muscle Group's recent presence (issue #188 / ADR-0025): the display `group`
// label (Legs / Chest / Back / Shoulders / Arms / Core — never Unclassified) and whether
// it was `covered` — trained at least once — in the coverage window. Presence, not a
// proportion: it names what has and hasn't appeared, it never flags or ranks.
export interface GroupCoverage {
  group: string;
  covered: boolean;
}

// The Muscle Group Coverage signal for the Analytics screen (issue #188 / ADR-0025): the
// six real groups each trained / not-trained over a fixed `weeks`-week window that is
// **independent of the range toggle**, in canonical order. Always all six groups, ungated
// and type-neutral — a pure yoga/mobility history reads the same shape as a barbell one.
// `unclassified_present` is true when some in-window set lists a muscle outside the six
// real groups (issue #189) — the signal behind a neutral disclosure footnote, never a
// seventh group and never a coverage target.
export interface RecentCoverage {
  weeks: number;
  groups: GroupCoverage[];
  unclassified_present: boolean;
}

// The honest read model for one range window (F3 Slice 1–5): sessions, active days,
// total sets, and the set-count muscle distribution drawn straight from the record
// side, the last 8 Personal Records all-time (`recent_records`, decoupled from the
// window so it is rarely empty), the range-scoped `new_prs` count, and the daily
// total-`volume` series with disclosed coverage and an equal-window delta.
// `muscle_distribution`, `recent_records`, and `volume.points` are empty when nothing
// qualifies.
export interface AnalyticsOverview {
  range: AnalyticsRange;
  sessions: number;
  active_days: number;
  total_sets: number;
  muscle_distribution: MuscleShare[];
  recent_records: PersonalRecordEntry[];
  new_prs: number;
  volume: VolumeSeries;
  coverage: RecentCoverage;
}
