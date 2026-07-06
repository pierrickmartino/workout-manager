import type { VolumePoint } from "./analytics-types";

// A daily volume point prepared for the Recharts line: the ISO `date` kept for the
// axis and keys, a short human `label` for the tick, and the raw `volume` in kg.
export interface VolumeChartRow {
  date: string;
  label: string;
  volume: number;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Format an ISO `yyyy-mm-dd` date as a short "Mon D" label. Parsed from the string
// parts so it is timezone-safe — never shifted a day by a Date constructor's local
// offset — and deterministic across environments.
function formatDayLabel(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

// Turn the API's daily volume points into chart rows, preserving the series'
// ascending order. Pure and server-free, so it is safe from a Client Component.
export function toVolumeRows(points: readonly VolumePoint[]): VolumeChartRow[] {
  return points.map((point) => ({
    date: point.date,
    label: formatDayLabel(point.date),
    volume: point.volume_kg,
  }));
}

// The trend badge: the window's volume against the immediately preceding equal-length
// window, as a signed whole percent ("+25%", "-8%"). Returns `null` when the API sends
// no baseline (`null`), so the caller simply omits the badge rather than showing "0%".
export function formatVolumeDelta(delta: number | null): string | null {
  if (delta === null) {
    return null;
  }
  const rounded = Math.round(delta);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}%`;
}

// The coverage disclosure that sits under the chart: honestly states the share of the
// window's logged volume the line actually converted, so a partial total is never
// presented as authoritative.
export function formatCoverageCaption(coverage: number): string {
  return `from ${Math.round(coverage)}% of your logged volume`;
}
