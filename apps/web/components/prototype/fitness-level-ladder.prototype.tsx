import * as React from "react";

import type { FitnessLevelVisualRow } from "@/lib/fitness-level-visual.prototype";
import { MAX_LEVEL } from "@/lib/fitness-level-visual.prototype";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/pulse/section-header";
import { Card } from "@/components/ui/card";

// PROTOTYPE — THROWAWAY. Variant C: "Comparative ladder".
//
// One figure instead of N rows. The scale becomes a shared vertical axis and each Training Type
// a column climbing it: neutral pips to the Declared level, accent pips for what the record
// earned on top. The bet here is a different *question*: the list variants answer "where is my
// strength level", while a shared axis answers "where am I strong and where am I not" — which
// is the comparison a reader actually makes, and the one two numbers per row make hardest.
//
// Keeps: every figure, as text, in an off-screen table (nothing plotted is unreadable).
// Drops: the list, the per-row sentence (demoted to one summary line), both numerals.

// Which rungs of the axis are labelled. The floor, the midpoint and the ceiling are enough to
// read a position off; labelling all ten turns the axis into the numbers this variant removes.
const LABELLED_RUNGS: readonly number[] = [1, 5, MAX_LEVEL];

function Axis(): React.JSX.Element {
  return (
    <div className="flex shrink-0 flex-col-reverse gap-[3px]" aria-hidden>
      {Array.from({ length: MAX_LEVEL }, (_, index) => {
        const rung = index + 1;
        return (
          <span
            key={rung}
            className="label-mono flex h-2.5 items-center text-[8px] leading-none text-text-muted"
          >
            {LABELLED_RUNGS.includes(rung) ? rung : ""}
          </span>
        );
      })}
    </div>
  );
}

function Column({ row }: { row: FitnessLevelVisualRow }): React.JSX.Element {
  return (
    <li className="flex min-w-0 flex-1 flex-col items-center gap-2">
      <div className="flex w-full flex-col-reverse gap-[3px]" aria-hidden>
        {Array.from({ length: MAX_LEVEL }, (_, index) => {
          const rung = index + 1;
          const earned = rung > row.declared && rung <= row.declared + row.earned;
          const filled = rung <= row.declared;
          return (
            <span
              key={rung}
              className={cn(
                "h-2.5 w-full rounded-[1px]",
                earned ? "bg-cyan" : filled ? "bg-text-muted" : "bg-elevated",
              )}
            />
          );
        })}
      </div>
      <h3 className="label-mono min-w-0 break-words text-center text-[9px] leading-tight text-text-secondary">
        {row.trainingType}
      </h3>
    </li>
  );
}

// The sentences the list variants print per row collapse into one line here, because five
// sentences under one figure is a paragraph nobody reads. Only the types the app is planning
// above are named — the equal case is still *stated*, as the "nothing in your record moves
// them" half, so no row goes silent (ADR-0112).
function summary(rows: readonly FitnessLevelVisualRow[]): string {
  const raised = rows.filter((row) => row.raised);
  if (raised.length === 0) {
    return "Every type is planning at exactly what you declared — nothing in your recent record moves them.";
  }
  const named = raised
    .map((row) => `${row.trainingType} +${row.earned}`)
    .join(", ");
  return `Earned from your recent record: ${named}. Every other type is planning at exactly what you declared.`;
}

export function FitnessLevelLadder({
  rows,
}: {
  rows: FitnessLevelVisualRow[];
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader>FITNESS LEVEL</SectionHeader>
      <Card className="flex flex-col gap-4 p-5">
        <p className="text-sm text-text-secondary">
          Your plans are generated at the Effective Fitness Level: what you declared, plus
          what your recent record shows. It is never read below what you declared.
        </p>

        <div className="flex items-start gap-2">
          <Axis />
          <ul className="flex min-w-0 flex-1 items-start gap-1.5">
            {rows.map((row) => (
              <Column key={row.trainingType} row={row} />
            ))}
          </ul>
        </div>

        <p className="text-xs text-text-secondary">{summary(rows)}</p>

        {/* Every plotted figure, as text — **visible** behind a disclosure rather than
            `sr-only`, which is ADR-0084's ruling for the charts: the barrier a hidden table
            leaves standing is pointer access, and a sighted reader who wants the exact level
            is exactly who this variant took the numerals away from. `table-fixed w-full` with
            no `nowrap`, so it wraps instead of scrolling sideways (an `sr-only` table does
            not: table layout ignores the 1px width and grew this document to 600px at 320px,
            which is how the first draft of this variant was caught). */}
        <details className="border-t border-border pt-3">
          <summary className="label-mono cursor-pointer text-[10px] text-text-muted">
            EXACT LEVELS
          </summary>
          <table className="mt-2 w-full table-fixed border-collapse">
            <caption className="mb-2 text-left text-xs text-text-secondary">
              Declared and Effective Fitness Level per Training Type, on a 1 to {MAX_LEVEL}{" "}
              scale.
            </caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="label-mono py-1 text-left text-[9px] text-text-muted">
                  TYPE
                </th>
                <th scope="col" className="label-mono py-1 text-right text-[9px] text-text-muted">
                  DECLARED
                </th>
                <th scope="col" className="label-mono py-1 text-right text-[9px] text-text-muted">
                  PLANNING AT
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.trainingType} className="border-b border-border last:border-0">
                  <th
                    scope="row"
                    className="py-1 text-left text-xs font-normal break-words text-text-secondary"
                  >
                    {row.trainingType}
                  </th>
                  <td className="py-1 text-right text-xs tabular-nums text-text-secondary">
                    {row.declared}
                  </td>
                  <td
                    className={cn(
                      "py-1 text-right text-xs tabular-nums",
                      row.raised ? "text-cyan" : "text-text-secondary",
                    )}
                  >
                    {row.effective}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border pt-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 shrink-0 rounded-[1px] bg-text-muted" aria-hidden />
            <span className="label-mono text-[9px] text-text-muted">DECLARED</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 shrink-0 rounded-[1px] bg-cyan" aria-hidden />
            <span className="label-mono text-[9px] text-text-muted">EARNED</span>
          </span>
        </div>
      </Card>
    </div>
  );
}
