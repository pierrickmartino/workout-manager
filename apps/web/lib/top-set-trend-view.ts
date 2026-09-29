import type { TopSetPoint } from "./exercise-stats-view";
import type { WeightUnit } from "./weight-unit";
import {
  formatWholeWeight,
  kgToUnit,
  weightUnitLabel,
  wholeWeightInUnit,
} from "./weight-format.ts";
import { formatDayLabel, formatFullDayLabel } from "./chart-date-label.ts";

// One bar in the Top-Set Trend chart: the ISO `date`, a short human `label` for the tick,
// the `estimate` (best Est. 1RM in the reader's unit) as the bar height, and `isLatest` so
// the most recent session's bar can be highlighted. `dateText`/`valueText` are the same
// point as retrievable text — the date with its year, and the estimate at the displayed
// whole-figure precision with its unit (ADR-0084).
//
// `key` is the row's React key and its identity in the values table, and it is the series
// *index*, not the date. The app is calendar-free: two Logged Sessions can be performed on
// one date, and `top_set_series` yields one point per qualifying session sorted on
// `performed_on` alone — so same-date points are possible and `date` is not unique. What
// the key deliberately does **not** do is disambiguate them for the reader: the API sends
// no session identity, and an ordinal like "1 of 2" would present the repository's
// incidental return order as a fact about the training. Two same-date rows therefore read
// honestly alike; naming them needs the session from the API.
export interface TopSetTrendRow {
  key: string;
  date: string;
  label: string;
  estimate: number;
  isLatest: boolean;
  dateText: string;
  valueText: string;
}

// The transformed Top-Set Trend (ADR-0017): the chart `rows` (empty → render no chart)
// and the `+N KG` delta pill (`null` → render no pill). Both degradations are decided
// here so the component stays a thin renderer.
export interface TopSetTrend {
  rows: TopSetTrendRow[];
  delta: string | null;
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
    key: String(index),
    date: point.date,
    label: formatDayLabel(point.date),
    // The bar height is the Estimated 1RM projected into the reader's unit (raw, unrounded)
    // so the bars stay proportional; the axis/tooltip label the component paints carries the
    // unit (#417).
    estimate: kgToUnit(point.estimated_1rm, unit),
    isLatest: index === lastIndex,
    dateText: formatFullDayLabel(point.date),
    valueText: formatWholeWeight(point.estimated_1rm, unit),
  }));

  return { rows, delta: formatDelta(series, unit) };
}

// What one row of the Top-Set values table means. It restates the qualification rules the
// chart already applies (ADR-0017) rather than adding any: an estimate, not a lifted
// weight; one point per *qualifying* session, so a session with nothing scorable in the
// trustworthy rep window is absent rather than zero; and the recent tail only.
export const TOP_SET_VALUES_CAPTION =
  "One row per qualifying session, most recent 8. Each value is the best Estimated 1RM " +
  "that session reached — a calculated estimate, not a weight lifted. A session with no " +
  "qualifying set has no row.";

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
