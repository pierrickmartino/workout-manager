// Shared, server-free date formatting for view-models. Pure string helpers with no
// server-only imports, so they are safe to import from both Server and Client Components.

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

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
