import type { TopSetPoint } from "./exercise-stats-view";
import type { WeightUnit } from "./weight-unit";
import { kgToUnit, weightUnitLabel, wholeWeightInUnit } from "./weight-format.ts";

// One bar in the Top-Set Trend chart: the ISO `date` kept for the React key, a short
// human `label` for the tick, the `estimate` (best Est. 1RM in kg) as the bar height,
// and `isLatest` so the most recent session's bar can be highlighted.
export interface TopSetTrendRow {
  date: string;
  label: string;
  estimate: number;
  isLatest: boolean;
}

// The transformed Top-Set Trend (ADR-0017): the chart `rows` (empty → render no chart)
// and the `+N KG` delta pill (`null` → render no pill). Both degradations are decided
// here so the component stays a thin renderer.
export interface TopSetTrend {
  rows: TopSetTrendRow[];
  delta: string | null;
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

// Turn the API's Top-Set series into chart rows and the trend delta. The series is
// already oldest-first and capped by the API. The delta is `latest − oldest` in whole
// kilograms, signed (`+N KG` / `-N KG`); it is `null` for a series of fewer than two
// points, because a single session has no trend to measure — the caller then omits the
// pill (and, for an empty series, the whole chart). Pure and server-free.
export function toTopSetTrend(
  series: readonly TopSetPoint[],
  unit: WeightUnit,
): TopSetTrend {
  const lastIndex = series.length - 1;
  const rows: TopSetTrendRow[] = series.map((point, index) => ({
    date: point.date,
    label: formatDayLabel(point.date),
    // The bar height is the Estimated 1RM projected into the reader's unit (raw, unrounded)
    // so the bars stay proportional; the axis/tooltip label the component paints carries the
    // unit (#417).
    estimate: kgToUnit(point.estimated_1rm, unit),
    isLatest: index === lastIndex,
  }));

  return { rows, delta: formatDelta(series, unit) };
}

function formatDelta(
  series: readonly TopSetPoint[],
  unit: WeightUnit,
): string | null {
  if (series.length < 2) {
    return null;
  }
  const change = series[series.length - 1].estimated_1rm - series[0].estimated_1rm;
  // A kilogram delta converts linearly; round to a whole figure in the reader's unit.
  const rounded = wholeWeightInUnit(change, unit);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded} ${weightUnitLabel(unit).toUpperCase()}`;
}
