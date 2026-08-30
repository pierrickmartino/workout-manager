import { cn } from "@/lib/utils";
import { formatBodyWeight, formatLoad } from "@/lib/load";
import { formatPace, formatQuantity, type Quantity } from "@/lib/quantity";
import type { LoggedSet } from "@/lib/logs-types";

interface LoggedSetTableProps {
  sets: LoggedSet[];
  // Whether to show the Performed Body Weight stat (ADR-0026). The record detail shows it;
  // the compact History card omits it. Off by default.
  showBodyWeight?: boolean;
}

// The stacked list of a Logged Session's performed sets. Each set is its own card: the
// exercise name on its own line (full, never truncated) above a flex-wrap row of labelled
// stats — the amount (with a pace projection for a timed distance set), load, optionally the
// Performed Body Weight, and RPE. Replaces the old fixed-column table that overflowed and
// truncated names on narrow phones. Shared by the History list card and the record detail
// page so the record renders identically wherever it is shown; every amount/load display
// still goes through the typed formatters, never re-derived.
export function LoggedSetTable({ sets, showBodyWeight = false }: LoggedSetTableProps) {
  return (
    <ul className="flex list-none flex-col gap-2.5 p-0">
      {sets.map((loggedSet) => (
        <LoggedSetRow
          key={loggedSet.position}
          loggedSet={loggedSet}
          showBodyWeight={showBodyWeight}
        />
      ))}
    </ul>
  );
}

// The stat label for a set's amount, keyed off its typed Quantity kind (ADR-0032): a rep
// count reads "Reps", a run "Distance", a timed hold "Duration". A missing amount falls
// back to "Reps" (the kind the log form has always sent).
function quantityLabel(quantity: Quantity | null): string {
  switch (quantity?.kind) {
    case "distance":
      return "Distance";
    case "duration":
      return "Duration";
    default:
      return "Reps";
  }
}

function LoggedSetRow({
  loggedSet,
  showBodyWeight,
}: {
  loggedSet: LoggedSet;
  showBodyWeight: boolean;
}) {
  // Pace is a read-time projection (ADR-0032), shown only for a distance set that
  // carries a time — never a stored figure, and absent for a distance-only set.
  const pace = formatPace(loggedSet.quantity);
  const load = loggedSet.load;
  // A non-numeric load ("Bodyweight", a qualitative cue) can run long, so it renders in
  // the softer sub style and is allowed to wrap; an absolute weight stays on one line.
  const loadIsText =
    load != null && (load.kind === "bodyweight" || load.kind === "qualitative");
  const hasRpe = loggedSet.perceived_difficulty != null;

  return (
    <li className="rounded-sm border border-border bg-base/40 px-4 py-3">
      <p className="mb-3 break-words font-display text-sm font-semibold leading-snug text-text-primary">
        {loggedSet.exercise_name}
      </p>
      <div className="flex flex-wrap gap-x-5 gap-y-2.5">
        <Stat
          label={quantityLabel(loggedSet.quantity)}
          value={formatQuantity(loggedSet.quantity)}
        />
        {pace ? (
          <Stat label="Pace" value={pace} valueClassName="font-normal text-text-muted" />
        ) : null}
        <Stat
          label="Load"
          value={formatLoad(load)}
          valueClassName={
            loadIsText ? "whitespace-normal break-words font-normal text-text-muted" : undefined
          }
        />
        {showBodyWeight ? (
          <Stat label="BW" value={formatBodyWeight(loggedSet.body_weight_kg)} />
        ) : null}
        <Stat
          label="RPE"
          value={hasRpe ? String(loggedSet.perceived_difficulty) : "—"}
          valueClassName={hasRpe ? "text-cyan" : "font-normal text-text-muted"}
        />
      </div>
    </li>
  );
}

// One labelled stat: a tiny uppercase mono label stacked over its value. The value is mono
// and nowrap by default (short numbers stay intact); callers override for wrapping text
// (a long qualitative load) or the cyan RPE accent.
function Stat({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="label-mono text-[9px] text-text-muted">{label}</span>
      <span
        className={cn(
          "whitespace-nowrap font-mono text-[13px] font-semibold text-text-primary",
          valueClassName,
        )}
      >
        {value}
      </span>
    </div>
  );
}
