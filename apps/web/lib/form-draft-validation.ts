export const MAX_DRAFT_ROWS = 500;
export const MAX_DRAFT_FIELDS = 7_000;
export const MAX_DRAFT_FIELD_LENGTH = 10_000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isBoundedDraftString(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_DRAFT_FIELD_LENGTH;
}

export function isDraftUuid(value: unknown): value is string {
  return isBoundedDraftString(value) && UUID_PATTERN.test(value);
}

export function isDraftDate(value: unknown): value is string {
  if (!isBoundedDraftString(value) || !ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function hasUniqueKeys(rows: Array<{ key?: number; id?: number }>): boolean {
  const keys = rows.map((row) => row.key ?? row.id);
  return keys.every(isPositiveInteger) && new Set(keys).size === keys.length;
}
