import type { PersonalRecordEntry } from "./analytics-types";
import { formatRecordAchievement } from "./record-achievement.ts";
import { formatShortDate } from "./date-format.ts";
import type { WeightUnit } from "./weight-unit";
import { weightUnitLabel, wholeWeightInUnit } from "./weight-format.ts";

// A Personal Record prepared for the Recent Records feed: the Exercise name, its
// achievement headline, the gain-over-prior-PR, and a short human date. `estimate` is
// the honest headline (ADR-0026) — an absolute record's whole-kg Estimated 1RM, or a
// bodyweight record's set ("bodyweight × 12" / "bodyweight + 20 kg × 5"), never a
// bodyweight kg figure. `gain` becomes a distinct "First PR" badge for the first-ever
// record rather than a misleading "+0 kg".
export interface RecordRow {
  exercise: string;
  estimate: string;
  gain: string;
  date: string;
}

// The "See all records" teaser that links the account-wide Recent Records feed (the
// last 8 PRs all-time) into the full, all-time Personal Record timeline on the Strength
// Analytics screen. `href` is the timeline target; `label` is the affordance text.
export interface RecentRecordsTeaser {
  href: string;
  label: string;
}

// Decide whether the Recent Records feed shows a teaser into the full PR timeline.
// Returned only when the user has qualifying strength history — the same condition that
// gates the Strength Analytics nav entry (at least one all-time PR) — so the link never
// lands on an empty screen. `null` means: render no affordance. Pure and server-free.
export function toRecentRecordsTeaser(
  records: readonly PersonalRecordEntry[],
): RecentRecordsTeaser | null {
  return records.length > 0
    ? { href: "/analytics/strength", label: "See all records →" }
    : null;
}

// Turn the API's Personal Record entries into display rows in the reader's Weight Unit,
// preserving the feed's newest-first order. The achievement headline and the gain-over-prior-PR
// are both projected to `unit` (the gain is a kilogram delta, which converts linearly, #417).
// Pure and server-free, so it is safe from either a Server or Client Component.
export function toRecordRows(
  records: readonly PersonalRecordEntry[],
  unit: WeightUnit,
): RecordRow[] {
  return records.map((record) => ({
    exercise: record.exercise,
    estimate: formatRecordAchievement(record, unit),
    gain:
      record.gain > 0
        ? `+${wholeWeightInUnit(record.gain, unit)} ${weightUnitLabel(unit)}`
        : "First PR",
    date: formatShortDate(record.date),
  }));
}
