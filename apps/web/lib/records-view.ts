import type { PersonalRecordEntry } from "./analytics-types";

// A Personal Record prepared for the Recent Records feed: the Exercise name, its new
// Estimated 1RM and gain-over-prior-PR rounded to whole kilograms for the eye, and a
// short human date. `gain` becomes a distinct "First PR" badge for the first-ever
// record rather than a misleading "+0 kg".
export interface RecordRow {
  exercise: string;
  estimate: string;
  gain: string;
  date: string;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Format an ISO `yyyy-mm-dd` date as a short "Mon D" label. Parsed from the string
// parts so it is timezone-safe — never shifted a day by a Date constructor's local
// offset — and deterministic across environments.
function formatRecordDate(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}`;
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

// Turn the API's Personal Record entries into display rows, preserving the feed's
// newest-first order. Pure and server-free, so it is safe from either a Server or
// Client Component.
export function toRecordRows(records: readonly PersonalRecordEntry[]): RecordRow[] {
  return records.map((record) => ({
    exercise: record.exercise,
    estimate: `${Math.round(record.estimated_1rm)} kg`,
    gain: record.gain > 0 ? `+${Math.round(record.gain)} kg` : "First PR",
    date: formatRecordDate(record.date),
  }));
}
