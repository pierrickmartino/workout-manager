// Shared, server-free date formatting for view-models. Pure string helpers with no
// server-only imports, so they are safe to import from both Server and Client Components.

import { parseIsoDay, parseIsoMonth } from "./iso-date.ts";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// The year as written, four digits.
function yearText(year: number): string {
  return String(year).padStart(4, "0");
}

// Format a `yyyy-mm` calendar month as "March 2026", for History's Month view (ADR-0138); a
// string that isn't a plain calendar month is returned as-is.
export function formatMonthYear(isoMonth: string): string {
  const parts = parseIsoMonth(isoMonth);
  if (parts === null) return isoMonth;
  return `${MONTH_NAMES[parts.monthNumber - 1]} ${yearText(parts.year)}`;
}

// The parts of a plain `yyyy-mm-dd` calendar day, or null when the string isn't one, read by the
// shared ISO parser, so no time zone can shift the day (ADR-0096).
function calendarDayParts(
  iso: string,
): { year: string; monthIndex: number; day: number } | null {
  const parts = parseIsoDay(iso);
  if (parts === null) return null;
  return { year: yearText(parts.year), monthIndex: parts.monthNumber - 1, day: parts.day };
}

// Format a `yyyy-mm-dd` calendar day as "14 Mar 2026", for Month view's count line
// (ADR-0138); a string that isn't a plain calendar day is returned as-is.
export function formatDayMonthYear(iso: string): string {
  const parts = calendarDayParts(iso);
  if (parts === null) return iso;
  return `${parts.day} ${MONTHS[parts.monthIndex]} ${parts.year}`;
}

// Format a `yyyy-mm-dd` calendar day in full as "14 October 2026", for Month view's day
// buttons' accessible names (ADR-0138); a string that isn't a plain calendar day is returned
// as-is.
export function formatFullDate(iso: string): string {
  const parts = calendarDayParts(iso);
  if (parts === null) return iso;
  return `${parts.day} ${MONTH_NAMES[parts.monthIndex]} ${parts.year}`;
}

// Format an ISO `yyyy-mm-dd` date as a short "Mon D" label. Timezone-safe — never shifted a day
// by a Date constructor's local offset — and deterministic across environments; a string that
// isn't a plain calendar day is returned as-is.
export function formatShortDate(iso: string): string {
  const parts = calendarDayParts(iso);
  if (parts === null) return iso;
  return `${MONTHS[parts.monthIndex]} ${parts.day}`;
}

// Format an ISO `yyyy-mm-dd` date as a "Mon D, YYYY" label (e.g. "Sep 5, 2026"), for a date
// that may sit in another year; a string that isn't a plain calendar day is returned as-is.
export function formatLongDate(iso: string): string {
  const parts = calendarDayParts(iso);
  if (parts === null) return iso;
  return `${MONTHS[parts.monthIndex]} ${parts.day}, ${parts.year}`;
}
