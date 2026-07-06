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
