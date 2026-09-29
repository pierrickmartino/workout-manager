// The one place a chart turns an ISO date into words (ADR-0084). Three view-models had
// forked copies of the same `MONTHS` table and `formatDayLabel`, and every copy omitted
// the year — so a series crossing a year boundary read "Dec 29" next to "Jan 5" with
// nothing to say which was which (CH-F2). Consolidating them means the year can only be
// missing or present in one place.
//
// Two forms, deliberately. The **short** form is a visual axis tick, where horizontal
// room is the constraint and the neighbouring ticks supply the context. The **full** form
// is a *value*: it is what the accessible values table and the pointer tooltip carry, and
// a value that cannot be placed in time unambiguously is not a complete value. The axis
// keeps the short form; anything a reader is meant to *retrieve* uses the full one.
//
// Parsed from the string parts rather than through `new Date(iso)`, so a date is never
// shifted a day by the local offset and the output is identical on a server, in a
// browser and in a test — the timezone-safety the three originals each noted.

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface DateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

// Callers hand this an ISO `yyyy-mm-dd` from a typed API projection, validated at that
// boundary; this module is the display end of the pipe, not a second validator.
function parseIsoDate(iso: string): DateParts {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

// "Sep 28" — the short axis-tick form. No year: an axis is a scale, not a value source.
export function formatDayLabel(iso: string): string {
  const { month, day } = parseIsoDate(iso);
  return `${MONTHS[month - 1]} ${day}`;
}

// "Sep 28, 2026" — the full, unambiguous form every retrievable value carries.
export function formatFullDayLabel(iso: string): string {
  const { year, month, day } = parseIsoDate(iso);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

// "Week of Sep 28, 2026" — a Monday-anchored week named by its start date. The prefix
// lives here rather than at three call sites so the weekly surfaces (Weekly Distance,
// Muscle Balance) cannot drift apart in how they say the same thing.
export function formatFullWeekLabel(iso: string): string {
  return `Week of ${formatFullDayLabel(iso)}`;
}
