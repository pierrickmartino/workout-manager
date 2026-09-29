import * as React from "react";

import { cn } from "@/lib/utils";

// Every plotted datum, as text (ADR-0084). A Recharts plot hands its values to the eye and
// to the pointer and to nobody else: the SVG carries no per-point text, and a tooltip that
// opens on hover cannot be opened by a keyboard. This is the same series in the one form
// every reader can reach — a native `<details>` disclosure over a real `<table>`.
//
// Three decisions worth not re-litigating:
//
// **It is visible, not `sr-only`.** The barrier CH-F1 measured is *pointer* access. A
// keyboard user with working eyes is affected exactly as much as a screen-reader user, and
// a visually-hidden table serves the second while abandoning the first.
//
// **It is a `<table>`, not the `DataList` `<dl>`.** A series is two-dimensional and
// homogeneous — a date column and a value column, N rows — so a table gives a reader the
// row count up front, column context on every cell, and table navigation. `DataList`'s
// grammar is per-entity metadata, which has neither columns nor a caption.
//
// **The `caption` states what one row *means*.** A bare pair of columns cannot say whether
// a missing date was a rest day or a dropped record, and these projections are sparse on
// purpose (no zero-padding, in either `volume-view` or the API's `top_set_series`). The
// caption is where that goes, because it reaches every reader without adding chrome.
//
// It renders nothing for an empty series: a caller that has no points renders its own
// empty state, and an empty disclosure would be a promise of values that aren't there.

export interface ChartValueRow {
  // Stable across renders and unique within the series. Where a series can hold two
  // points with the same date, this is *not* the date (see `top-set-trend-chart`).
  readonly key: string;
  // The point's place on the domain, unambiguous in isolation — so, with its year.
  readonly label: string;
  // The value at the precision the chart itself displays, with its unit.
  readonly value: string;
}

interface ChartValuesProps {
  // What one row means, including how absent rows should be read. Shown to everyone.
  readonly caption: string;
  readonly labelHeading: string;
  readonly valueHeading: string;
  readonly rows: readonly ChartValueRow[];
  readonly className?: string;
}

export function ChartValues({
  caption,
  labelHeading,
  valueHeading,
  rows,
  className,
}: ChartValuesProps): React.JSX.Element | null {
  if (rows.length === 0) {
    return null;
  }
  return (
    <details className={cn("group mt-3", className)}>
      <summary
        className={
          "label-mono cursor-pointer rounded-sm text-[10px] text-text-secondary " +
          "outline-none transition-colors hover:text-text-primary " +
          "focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 " +
          "focus-visible:ring-offset-base"
        }
      >
        {`SHOW ALL ${rows.length} VALUES`}
      </summary>
      {/* `table-fixed` with no `whitespace-nowrap` anywhere: a long series must grow the
          card downward and never widen the document, which at 320px is the difference
          between a values table and a horizontal-scroll defect. */}
      <table className="mt-2 w-full table-fixed border-collapse">
        <caption className="mb-2 text-left font-sans text-xs text-text-secondary">
          {caption}
        </caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="label-mono py-1.5 text-left text-[10px] text-text-muted">
              {labelHeading}
            </th>
            <th scope="col" className="label-mono py-1.5 text-right text-[10px] text-text-muted">
              {valueHeading}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-border-lite last:border-b-0">
              <td className="py-1.5 pr-2 font-sans text-xs text-text-secondary">
                {row.label}
              </td>
              <td className="py-1.5 text-right font-sans text-xs text-text-primary tabular-nums">
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
