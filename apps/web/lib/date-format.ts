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
