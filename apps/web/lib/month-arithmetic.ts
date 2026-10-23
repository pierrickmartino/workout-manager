// Arithmetic on plain `YYYY-MM` months, for History's Month view (ADR-0138). A month is a
// calendar value, not an instant, so this is arithmetic on its parts — never a `Date`, which a
// time zone could shift (ADR-0096).

export const DAYS_PER_WEEK = 7;
const MONTHS_PER_YEAR = 12;

function parts(month: string): [year: number, monthNumber: number] {
  const [year, monthNumber] = month.split("-").map(Number);
  return [year, monthNumber];
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// How many days a `YYYY-MM` month holds, February counting the leap years.
export function daysInMonth(month: string): number {
  const [year, monthNumber] = parts(month);
  if (monthNumber === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[monthNumber - 1];
}

// The column the month's 1st falls in on a Monday-first week: 0 for a Monday, 6 for a Sunday —
// the same week the Streak and the Training Heatmap count (ADR-0054). Sakamoto's day-of-week
// method, which gives 0 for a Sunday.
const SAKAMOTO_OFFSETS = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];

export function mondayColumnOfFirst(month: string): number {
  const [year, monthNumber] = parts(month);
  const y = monthNumber < 3 ? year - 1 : year;
  const sundayFirst =
    (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) +
      SAKAMOTO_OFFSETS[monthNumber - 1] + 1) %
    DAYS_PER_WEEK;
  return (sundayFirst + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
}

// The `YYYY-MM-DD` of day `day` of `month`.
export function dayOfMonth(month: string, day: number): string {
  return `${month}-${String(day).padStart(2, "0")}`;
}

// The `YYYY-MM` `delta` months from `month`, counting across year ends.
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = parts(month);
  const total = year * MONTHS_PER_YEAR + (monthNumber - 1) + delta;
  const nextYear = Math.floor(total / MONTHS_PER_YEAR);
  const nextMonth = (total % MONTHS_PER_YEAR) + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}`;
}
