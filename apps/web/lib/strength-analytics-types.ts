// Shared Strength Analytics types. This module has NO server-only imports, so it is
// safe to import from both Server and Client Components. The server-only data access
// (Clerk auth + fetch) lives in `lib/strength-analytics.ts`.

import type { PersonalRecordEntry } from "./analytics-types";
import type { TopSetPoint } from "./exercise-stats-view";

// One ranked strength trajectory (issue #177): a qualifying Exercise and its oldest-first
// Top-Set series, as ranked by the API. `series` carries the same `{date, estimated_1rm}`
// points the Exercise Detail chart uses, so the screen's small-multiple is a faithful
// teaser of the canonical chart the tile links to.
export interface ExerciseTrajectory {
  exercise_id: number;
  exercise: string;
  series: TopSetPoint[];
}

// The Strength Analytics screen's read model: the all-time, all-Exercise Personal Record
// timeline for one page (newest-first), the ranked strength `trajectories` — the top
// qualifying Exercises' Top-Set small-multiples, unpaginated — and the
// `has_qualifying_strength` gate. `records` is empty when the requested page holds no PRs;
// `trajectories` is empty for a user with no qualifying lift; the gate is `false` for a
// user with no comparable strength history, which is how the account Analytics screen
// decides whether to offer this screen at all.
export interface StrengthAnalyticsOverview {
  has_qualifying_strength: boolean;
  records: PersonalRecordEntry[];
  trajectories: ExerciseTrajectory[];
}
