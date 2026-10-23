// Shared, server-free date formatting for view-models. Pure string helpers with no
// server-only imports, so they are safe to import from both Server and Client Components.

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Format a `yyyy-mm` calendar month as "March 2026", for History's Month view (ADR-0138).
// Parsed by regex, never `new Date`, so it is timezone-safe; a string that isn't a plain
// calendar month is returned as-is.
export function formatMonthYear(isoMonth: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(isoMonth);
  const name = match === null ? undefined : MONTH_NAMES[Number(match[2]) - 1];
  if (match === null || name === undefined) {
    return isoMonth;
  }
  return `${name} ${match[1]}`;
}

// The parts of a plain `yyyy-mm-dd` calendar day, or null when the string isn't one. Parsed by
// regex, never `new Date`, so no time zone can shift the day (ADR-0096).
function calendarDayParts(
  iso: string,
): { year: string; monthIndex: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match === null) return null;
  const monthIndex = Number(match[2]) - 1;
  if (MONTHS[monthIndex] === undefined) return null;
  return { year: match[1], monthIndex, day: Number(match[3]) };
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

// Format an ISO `yyyy-mm-dd` date as a short "Mon D" label. Parsed from the string parts
// so it is timezone-safe — never shifted a day by a Date constructor's local offset — and
// deterministic across environments.
export function formatShortDate(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

// Format an ISO `yyyy-mm-dd` date as a "Mon D, YYYY" label (e.g. "Sep 5, 2026"), for a date
// that may sit in another year. Parsed by regex, never `new Date`, so it is timezone-safe; a
// string that isn't a plain calendar date is returned as-is.
export function formatLongDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match === null) {
    return iso;
  }
  const [, year, month, day] = match;
  const abbreviation = MONTHS[Number(month) - 1];
  if (abbreviation === undefined) {
    return iso;
  }
  return `${abbreviation} ${Number(day)}, ${year}`;
}
