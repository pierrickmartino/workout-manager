import type { PrescriptionPlanView } from "@/lib/prescription-plan-view";
import type { SchemeNextStep } from "@/lib/scheme-next-step";
import { cn } from "@/lib/utils";

// The Session detail card's plan as a set table, the read-only twin of the Live Session's
// (ADR-0114): a column header, one row per prescribed set, then a dashed "NEXT" row naming what
// the Progression Scheme changes, in the column it changes, with the condition beneath. A scheme
// that cannot step this movement says it holds and why. Server-safe: no state, no handlers.
//
// Rows are wrapping flex rows, not a grid (ADR-0085/0114): each cell asks a basis and grows, so
// the columns align down the table and a row wraps at 200% text instead of squeezing a value.

const ROW = "flex min-w-0 flex-wrap items-center gap-1.5";
const TAG_CELL = "w-10 shrink-0 text-center";
const VALUE_CELL = "min-w-0 grow basis-16 break-words rounded-sm px-2 py-1.5 text-center";

interface PrescriptionSetTableProps {
  name: string;
  view: PrescriptionPlanView;
  next: SchemeNextStep;
}

export function PrescriptionSetTable({ name, view, next }: PrescriptionSetTableProps) {
  return (
    <div className="flex flex-col gap-1">
      {/* Every row names its cells in full for a screen reader, so the captions are visual only. */}
      <div className={cn(ROW, "label-mono text-[9px] text-text-muted")} aria-hidden>
        <span className={TAG_CELL}>SET</span>
        <span className={cn(VALUE_CELL, "py-0")}>REPS</span>
        <span className={cn(VALUE_CELL, "py-0")}>LOAD</span>
      </div>
      <ol aria-label={`Planned sets for ${name}`} className="flex list-none flex-col gap-1 p-0">
        {view.setNumbers.map((number) => (
          <li
            key={number}
            aria-label={`Set ${number}: ${view.reps}, ${view.load}`}
            className={cn(ROW, "font-mono text-[13px] text-text-primary")}
          >
            <span className={cn(TAG_CELL, "text-[12px] font-bold text-text-muted")} aria-hidden>
              {number}
            </span>
            <span className={cn(VALUE_CELL, "bg-base")} aria-hidden>
              {view.reps}
            </span>
            <span className={cn(VALUE_CELL, "bg-base")} aria-hidden>
              {view.load}
            </span>
          </li>
        ))}
      </ol>
      <NextRow next={next} />
    </div>
  );
}

function NextRow({ next }: { next: SchemeNextStep }) {
  const label =
    next.kind === "hold"
      ? `Next time: holds as written. ${next.reason}`
      : `Next time: ${next.change} when ${next.when}${next.otherwise ? `; ${next.otherwise}` : ""}.`;
  return (
    <div role="group" aria-label={label} className="mt-1 flex flex-col gap-1">
      <div
        aria-hidden
        className={cn(
          ROW,
          "rounded-sm border border-dashed py-1 font-mono text-[13px]",
          next.kind === "step" ? "border-cyan text-cyan" : "border-border text-text-muted",
        )}
      >
        <span className={cn(TAG_CELL, "label-mono text-[9px]")}>NEXT</span>
        {next.kind === "hold" ? (
          <span className={VALUE_CELL}>holds as written</span>
        ) : next.moves === "variation" ? (
          <span className={cn(VALUE_CELL, "font-bold")}>{next.change}</span>
        ) : (
          <>
            <span className={cn(VALUE_CELL, next.moves === "reps" ? "font-bold" : "text-text-muted")}>
              {next.moves === "reps" ? next.change : "="}
            </span>
            <span className={cn(VALUE_CELL, next.moves === "load" ? "font-bold" : "text-text-muted")}>
              {next.moves === "load" ? next.change : "="}
            </span>
          </>
        )}
      </div>
      <p aria-hidden className="pl-1 font-mono text-[11px] leading-snug text-text-muted">
        {next.kind === "hold" ? (
          next.reason
        ) : (
          <>
            when {next.when}
            {next.otherwise ? ` · ${next.otherwise}` : null}
          </>
        )}
      </p>
    </div>
  );
}
