import { formatLoad } from "@/lib/load";
import { formatPace, formatQuantity } from "@/lib/quantity";
import type { LoggedSet } from "@/lib/logs-types";

interface LoggedSetTableProps {
  sets: LoggedSet[];
  // Whether to show the Performed Body Weight column (ADR-0026). The record detail shows it;
  // the compact History card omits it. Off by default.
  showBodyWeight?: boolean;
}

// The compact table of a Logged Session's performed sets — exercise, amount (with a pace
// projection for a timed distance set), load, optionally the Performed Body Weight, and RPE.
// Shared by the History list card and the record detail page so the record renders
// identically wherever it is shown; the amount and load display go through the typed
// formatters, never re-derived.
export function LoggedSetTable({ sets, showBodyWeight = false }: LoggedSetTableProps) {
  const gridCols = showBodyWeight
    ? "grid-cols-[1fr_3rem_4rem_4rem_3rem]"
    : "grid-cols-[1fr_3rem_4rem_3rem]";
  return (
    <div className="flex flex-col gap-1.5">
      <div className={`grid ${gridCols} gap-2 px-1`}>
        <SetHead>Exercise</SetHead>
        <SetHead className="text-right">Reps</SetHead>
        <SetHead className="text-right">Load</SetHead>
        {showBodyWeight ? <SetHead className="text-right">BW</SetHead> : null}
        <SetHead className="text-right">RPE</SetHead>
      </div>
      {sets.map((loggedSet) => (
        <LoggedSetRow
          key={loggedSet.position}
          loggedSet={loggedSet}
          gridCols={gridCols}
          showBodyWeight={showBodyWeight}
        />
      ))}
    </div>
  );
}

function SetHead({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`label-mono text-[9px] text-text-muted ${className ?? ""}`}>
      {children}
    </span>
  );
}

function LoggedSetRow({
  loggedSet,
  gridCols,
  showBodyWeight,
}: {
  loggedSet: LoggedSet;
  gridCols: string;
  showBodyWeight: boolean;
}) {
  // Pace is a read-time projection (ADR-0032), shown only for a distance set that
  // carries a time — never a stored figure, and absent for a distance-only set.
  const pace = formatPace(loggedSet.quantity);
  return (
    <div
      className={`grid ${gridCols} items-center gap-2 rounded-sm border border-border bg-base/40 px-3 py-2.5`}
    >
      <span className="truncate font-sans text-[13px] text-text-primary">
        {loggedSet.exercise_name}
      </span>
      <span className="flex flex-col items-end">
        <span className="font-display text-sm font-semibold text-text-primary">
          {formatQuantity(loggedSet.quantity)}
        </span>
        {pace ? (
          <span className="font-mono text-[10px] text-text-muted">{pace}</span>
        ) : null}
      </span>
      <span className="text-right font-mono text-[13px] text-text-secondary">
        {formatLoad(loggedSet.load)}
      </span>
      {showBodyWeight ? (
        <span className="text-right font-mono text-[13px] text-text-secondary">
          {loggedSet.body_weight_kg != null ? `${loggedSet.body_weight_kg} kg` : "—"}
        </span>
      ) : null}
      <span className="text-right font-mono text-[13px] text-cyan">
        {loggedSet.perceived_difficulty ?? "—"}
      </span>
    </div>
  );
}
