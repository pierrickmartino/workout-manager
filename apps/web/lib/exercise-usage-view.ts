// Pure view-model for the Browse-the-Catalog usage marker (ADR-0042). A read-time
// projection turned into a strictly *descriptive* TRAINED / NEW signal with relative
// recency — never a call to action, never "overdue" styling, the same discipline as
// Muscle Group Coverage (ADR-0025). No server or React imports, so it is unit-testable
// with `node --test`.

import type { ExerciseUsage } from "./exercise-browse-types";

export interface UsageMarker {
  // Whether the user has ever logged a set of this Exercise. `false` reads as NEW.
  trained: boolean;
  // The descriptive recency phrase for a trained movement ("this week", "3 wks ago"), or
  // "NEW" when never trained. No imperative, by design.
  label: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Build the id → last-performed-date lookup the row marker reads, from the usage list the
// `/api/exercises/usage` endpoint returns. A `Map` so a browse list of any length looks up
// each row in O(1).
export function buildUsageMap(usage: readonly ExerciseUsage[]): Map<number, string> {
  return new Map(usage.map((entry) => [entry.exercise_id, entry.last_performed_on]));
}

function recencyLabel(daysAgo: number): string {
  if (daysAgo <= 0) return "today";
  if (daysAgo < 7) return "this week";
  if (daysAgo < 14) return "last week";
  return `${Math.floor(daysAgo / 7)} wks ago`;
}

// The marker for one Exercise: NEW when never performed, otherwise TRAINED with a relative
// recency computed from the last-performed date against `referenceIso` (today). Both are
// date-only ISO strings (YYYY-MM-DD); an unparseable date degrades to a bare "trained"
// rather than a fabricated recency.
export function usageMarker(
  lastPerformedOn: string | null | undefined,
  referenceIso: string,
): UsageMarker {
  if (!lastPerformedOn) return { trained: false, label: "NEW" };

  const last = Date.parse(lastPerformedOn);
  const reference = Date.parse(referenceIso);
  if (Number.isNaN(last) || Number.isNaN(reference)) {
    return { trained: true, label: "trained" };
  }

  const daysAgo = Math.floor((reference - last) / MS_PER_DAY);
  return { trained: true, label: recencyLabel(daysAgo) };
}
