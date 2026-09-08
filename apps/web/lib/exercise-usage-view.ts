// Pure view-model for the Browse-the-Catalog usage marker (ADR-0042). A read-time
// projection turned into a strictly *descriptive* TRAINED / NEW signal with relative
// recency — never a call to action, never "overdue" styling, the same discipline as
// Muscle Group Coverage (ADR-0025). No server or React imports, so it is unit-testable
// with `node --test`.

import type { ExerciseUsage } from "./exercise-browse-types";

export interface UsageMarker {
  // Whether the user has ever logged a set of this Exercise. `false` reads as NEW.
  trained: boolean;
  // The self-contained, descriptive recency phrase for a trained movement ("this week",
  // "3 wks ago"), or `null` when never trained *or* when the last-performed date can't be
  // parsed — never a sentinel word. The phrase stands alone (no imperative, by design);
  // `usageBadgeText` composes it into the badge so the component never re-narrates it.
  recency: string | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Build the id → last-performed-date lookup the row marker reads, from the usage list the
// `/api/exercises/usage` endpoint returns. A `Map` so a browse list of any length looks up
// each row in O(1).
export function buildUsageMap(usage: readonly ExerciseUsage[]): Map<number, string> {
  return new Map(usage.map((entry) => [entry.exercise_id, entry.last_performed_on]));
}

function recencyPhrase(daysAgo: number): string {
  if (daysAgo <= 0) return "today";
  if (daysAgo < 7) return "this week";
  if (daysAgo < 14) return "last week";
  return `${Math.floor(daysAgo / 7)} wks ago`;
}

// The marker for one Exercise: NEW when never performed, otherwise TRAINED with a relative
// recency computed from the last-performed date against `referenceIso` (today). Both are
// date-only ISO strings (YYYY-MM-DD); an unparseable date degrades to TRAINED with `recency:
// null` (unknown) rather than a fabricated recency.
export function usageMarker(
  lastPerformedOn: string | null | undefined,
  referenceIso: string,
): UsageMarker {
  if (!lastPerformedOn) return { trained: false, recency: null };

  const last = Date.parse(lastPerformedOn);
  const reference = Date.parse(referenceIso);
  if (Number.isNaN(last) || Number.isNaN(reference)) {
    return { trained: true, recency: null };
  }

  const daysAgo = Math.floor((reference - last) / MS_PER_DAY);
  return { trained: true, recency: recencyPhrase(daysAgo) };
}

// The badge caption for a usage marker. NEW when never trained; otherwise "TRAINED" alone
// when recency is unknown, or "TRAINED · <recency>" once. The recency phrases are already
// self-contained ("today", "last week"), so no "last" prefix is added here or in the
// component — that would double up into "last last week" (ADR-0042). Centralising the
// composed string in this pure, unit-tested seam is what keeps the component from
// re-narrating the phrase and re-introducing that collision.
export function usageBadgeText(marker: UsageMarker): string {
  if (!marker.trained) return "NEW";
  return marker.recency ? `TRAINED · ${marker.recency}` : "TRAINED";
}
