import { toTopSetTrend, type TopSetTrend } from "./top-set-trend-view.ts";
import type { ExerciseTrajectory } from "./strength-analytics-types.ts";
import { appendFrom } from "./back-target.ts";
import type { WeightUnit } from "./weight-unit";
import { weightUnitLabel } from "./weight-format.ts";

// One tile in the ranked strength small-multiples (issue #177 / ADR-0024): a qualifying
// Exercise, a deep link to its canonical Top-Set chart on Exercise Detail, and the same
// trend `rows`/`delta` that full chart renders. The small-multiple is a teaser — tapping
// through opens the one-story chart ADR-0017 settled on — so it reuses `toTopSetTrend`
// verbatim rather than shaping a second, subtly-different chart here.
export interface StrengthTrajectoryTile {
  exerciseId: number;
  exercise: string;
  href: string;
  // The most recent session's Top Set, rounded to whole kilograms — the tile's headline.
  estimate: string;
  // A screen-reader label carrying what the decorative bar chart cannot convey aurally:
  // the lift, its latest Top Set, and (when more than one session) the trend delta.
  ariaLabel: string;
  trend: TopSetTrend;
}

// Shape the API's ranked trajectories into small-multiple tiles, preserving the server's
// frequency ranking (the view never reorders them). Each tile's chart is derived through
// the shared Top-Set transform, so a small-multiple and the full chart agree bar-for-bar.
// An empty input yields no tiles, the signal for the screen to hide the whole section.
// Pure and server-free, so it is safe from either a Server or Client Component.
export function toStrengthTrajectories(
  trajectories: readonly ExerciseTrajectory[],
  unit: WeightUnit,
): StrengthTrajectoryTile[] {
  return trajectories.map((trajectory) => {
    const trend = toTopSetTrend(trajectory.series, unit);
    // A trajectory is only built for a qualifying Exercise, so its series — and therefore
    // `trend.rows` — always holds at least one session; the latest is the last row. The
    // row estimate is already projected into the reader's unit, so the headline just rounds
    // it and appends the unit label (#417).
    const latest = trend.rows[trend.rows.length - 1];
    const estimate = `${Math.round(latest.estimate)} ${weightUnitLabel(unit)}`;
    return {
      exerciseId: trajectory.exercise_id,
      exercise: trajectory.exercise,
      href: appendFrom(
        `/exercises/${trajectory.exercise_id}`,
        "/analytics/strength",
      ),
      estimate,
      ariaLabel: buildLabel(trajectory.exercise, estimate, trend.delta),
      trend,
    };
  });
}

// The tile's accessible name. The trend clause is dropped for a single-session trajectory
// (`delta` is `null`), so a lift with no measurable trend is never described as trending.
function buildLabel(
  exercise: string,
  estimate: string,
  delta: string | null,
): string {
  const trendClause = delta ? `, ${delta} over recent sessions` : "";
  return `${exercise}: latest top set ${estimate}${trendClause}. View full chart.`;
}
