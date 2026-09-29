import type { VolumePoint } from "./analytics-types";
import type { WeightUnit } from "./weight-unit";
import { formatWholeWeight, kgToUnit } from "./weight-format.ts";
import { formatDayLabel, formatFullDayLabel } from "./chart-date-label.ts";

// A daily volume point prepared for the Recharts line: the ISO `date` kept for the
// axis and keys, a short human `label` for the tick, and the raw `volume` projected into
// the reader's Weight Unit (unrounded, so the line stays proportional). Total volume is a
// tonnage — a weight surface — so it tracks the reader's unit like every other weight (#417).
//
// `dateText` and `valueText` are the same point as *retrievable text*: the date with its
// year, and the figure at the precision the chart displays, with its unit. They live here
// rather than in the component (ADR-0084) so the tooltip and the accessible values table
// render one string built once — a rounding rule duplicated at two call sites is a parity
// bug waiting for someone to edit one of them. This is where the proportional plot value
// and the spoken value formally part ways: `volume` stays raw, `valueText` is rounded.
export interface VolumeChartRow {
  date: string;
  label: string;
  volume: number;
  dateText: string;
  valueText: string;
}

// Turn the API's daily volume points into chart rows, preserving the series'
// ascending order. Pure and server-free, so it is safe from a Client Component.
export function toVolumeRows(
  points: readonly VolumePoint[],
  unit: WeightUnit,
): VolumeChartRow[] {
  return points.map((point) => ({
    date: point.date,
    label: formatDayLabel(point.date),
    volume: kgToUnit(point.volume_kg, unit),
    dateText: formatFullDayLabel(point.date),
    valueText: formatWholeWeight(point.volume_kg, unit),
  }));
}

// What one row of the Volume values table means. The series carries a point only for a day
// the reader actually logged — `volume-view` invents no zeros — so an absent date is a day
// without training, not a missing record. Said plainly, because a two-column table cannot
// say it and a reader comparing the table against their own history will wonder.
export const VOLUME_VALUES_CAPTION =
  "One row per logged day, in order. Days with no logged training have no row.";

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
