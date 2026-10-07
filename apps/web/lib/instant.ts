// Reading and writing an *instant* — a moment on the clock, as opposed to the calendar dates
// `date-format.ts` handles (ADR-0096).
//
// Server-free and React-free, so a Server Component may parse with it and a Client Component
// may format with it. Which is the whole point: the parse is the same everywhere, and only the
// *writing out* belongs to the reader's machine.

// An ISO date-time with no trailing `Z` and no `±hh:mm` offset. The API emits this shape
// because `created_at` lives in a `TIMESTAMP WITHOUT TIME ZONE` column, so the UTC moment
// Python wrote comes back without the offset it was written with — and ES parses an offsetless
// date-time as *local* time, which shifts the moment by the reader's own offset.
const NAIVE_DATE_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

// The same instant with its offset stated — the machine-readable form, for a `<time datetime>`
// — or null when the string is not an instant at all. Assuming UTC is a reading of *silence*:
// a string that states an offset keeps the one it states.
export function normalizeApiInstant(iso: string): string | null {
  const trimmed = iso.trim();
  if (trimmed === "") return null;
  const normalized = NAIVE_DATE_TIME.test(trimmed)
    ? `${trimmed.replace(" ", "T")}Z`
    : trimmed;
  return Number.isNaN(Date.parse(normalized)) ? null : normalized;
}

// An API instant as epoch milliseconds, or null when the string is not one. Null rather than
// `NaN` or 0, so a caller cannot accidentally render "1 Jan 1970" for a row it failed to read.
export function parseApiInstant(iso: string): number | null {
  const normalized = normalizeApiInstant(iso);
  return normalized === null ? null : Date.parse(normalized);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

// The zone-explicit text: what the server renders, and what the first client paint renders
// before `LocalInstant` knows it is in a browser. Built from the UTC getters, so it is
// byte-identical in every environment — which is what keeps it out of a hydration mismatch —
// and it names its clock, so it is never quietly read as the reader's own.
export function formatInstantUtc(epochMs: number): string {
  const at = new Date(epochMs);
  return (
    `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}` +
    ` ${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())} UTC`
  );
}

// The reader's own text: their locale, their timezone, their ordering. Only ever called after
// mount, because on the server "the reader's locale" is the container's.
//
// The year is explicit: an audit trail holds entries from years back, and `Mar 4, 09:05` is
// not a timestamp. Everything else is the platform's to decide.
export function formatInstantLocal(epochMs: number): string {
  return new Date(epochMs).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
