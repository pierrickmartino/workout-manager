// The one parser for plain ISO calendar values: a `YYYY-MM` month and a `YYYY-MM-DD` day.
// Parsed by regex, never `new Date`, so no time zone can shift them (ADR-0096). Server-free,
// so view-models on either side of the client boundary share it.

export interface IsoMonthParts {
  year: number;
  // 1–12.
  monthNumber: number;
}

export interface IsoDayParts extends IsoMonthParts {
  // The two-digit day as written; whether it exists in its month is the caller's check.
  day: number;
}

const ISO_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const ISO_DAY = /^(\d{4})-(0[1-9]|1[0-2])-(\d{2})$/;

// The parts of a `YYYY-MM` month with a real month number, or null when the string isn't one.
export function parseIsoMonth(iso: string): IsoMonthParts | null {
  const match = ISO_MONTH.exec(iso);
  if (match === null) return null;
  return { year: Number(match[1]), monthNumber: Number(match[2]) };
}

// The parts of a `YYYY-MM-DD` day with a real month number, or null when the string isn't one.
export function parseIsoDay(iso: string): IsoDayParts | null {
  const match = ISO_DAY.exec(iso);
  if (match === null) return null;
  return { year: Number(match[1]), monthNumber: Number(match[2]), day: Number(match[3]) };
}
