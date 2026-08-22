"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Copy, Repeat } from "lucide-react";

import type { LoggedSession } from "@/lib/logs-types";
import { TRAINING_TYPES } from "@/lib/sessions-types";
import {
  deriveExerciseOptions,
  filterHistory,
  hasActiveFilters,
  historyFiltersToQuery,
  parseHistoryFilters,
  type HistoryFilters,
} from "@/lib/history-filter";
import { sessionReuse } from "@/lib/session-reuse";
import {
  DELETE_TAIL_FIRST_REASON,
  UNCOMPLETE_TAIL_FIRST_REASON,
} from "@/lib/log-correction-reasons";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/pulse/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DeleteLogControl } from "@/components/DeleteLogControl";
import { OutcomeToggle } from "@/components/OutcomeToggle";
import { LoggedSetTable } from "@/components/LoggedSetTable";

// The interactive History screen: search by exercise + filter by Training Type over the
// record (ADR-0031). Filtering is entirely client-side over the already-fetched feed (Q4) —
// the filter state lives in React and is mirrored into the URL with `history.replaceState`
// (Q8) rather than a router navigation, so a keystroke never re-runs the Server Component or
// re-fetches history. The URL round-trips through `history-filter`, so a shared or refreshed
// link restores the same view. All matching lives in the `history-filter` view-model; this
// component only wires controls to it.
export function HistoryBrowser({
  records,
}: {
  records: LoggedSession[];
}): React.JSX.Element {
  // Seed once from the URL, then own the state locally (see the replaceState note above).
  const initialParams = useSearchParams();
  const [filters, setFilters] = useState<HistoryFilters>(() =>
    parseHistoryFilters(new URLSearchParams(initialParams.toString())),
  );

  const exerciseOptions = useMemo(
    () => deriveExerciseOptions(records),
    [records],
  );
  const filtered = useMemo(
    () => filterHistory(records, filters),
    [records, filters],
  );
  const active = hasActiveFilters(filters);

  function apply(next: HistoryFilters): void {
    setFilters(next);
    const query = historyFiltersToQuery(next).toString();
    const url = query.length > 0 ? `?${query}` : window.location.pathname;
    // Update the shareable URL without a navigation, so the Server Component and its
    // one-shot history fetch are never re-run by a filter change (Q4/Q8).
    window.history.replaceState(null, "", url);
  }

  function setExercise(value: string): void {
    apply({ ...filters, exercise: value.length > 0 ? value : null });
  }

  function toggleType(type: string): void {
    const trainingTypes = filters.trainingTypes.includes(type)
      ? filters.trainingTypes.filter((t) => t !== type)
      : [...filters.trainingTypes, type];
    apply({ ...filters, trainingTypes });
  }

  function clear(): void {
    apply({ exercise: null, trainingTypes: [] });
  }

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        overline="PULSE // STATS"
        title="Training history"
        action={
          <div className="flex items-center gap-3">
            <Link
              href="/logs/new"
              className="label-mono text-[11px] text-cyan hover:underline"
            >
              + Log a movement
            </Link>
            {/* Filtered count with total context when a facet is active, else the plain
                total (Q9) — so a narrowed list never looks like a shrunken history. */}
            <Badge variant="muted">
              {active
                ? `${filtered.length} of ${records.length}`
                : records.length}{" "}
              LOGGED
            </Badge>
          </div>
        }
      />

      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="history-exercise"
            className="label-mono text-[10px] text-text-muted"
          >
            EXERCISE
          </label>
          {/* Exact pick from the movements the user has actually logged (Q2/Q5): a native
              datalist keeps it zero-dependency and type-ahead, matching the movement name
              on the record's Logged Sets. */}
          <Input
            id="history-exercise"
            type="search"
            list="history-exercise-options"
            placeholder="Any exercise"
            value={filters.exercise ?? ""}
            onChange={(event) => setExercise(event.target.value)}
          />
          <datalist id="history-exercise-options">
            {exerciseOptions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>

        <div className="flex flex-col gap-2">
          <span className="label-mono text-[10px] text-text-muted">
            TRAINING TYPE
          </span>
          {/* Multi-select (Q6): any selected type keeps the session (OR within the facet),
              intersected with the exercise facet (Q7). */}
          <div className="flex flex-wrap gap-2">
            {TRAINING_TYPES.map((type) => {
              const on = filters.trainingTypes.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleType(type)}
                  className={cn(
                    "label-mono rounded-sm border px-3 py-1.5 text-[10px] capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 motion-reduce:transition-none",
                    on
                      ? "border-cyan/40 bg-cyan-dim text-cyan"
                      : "border-border text-text-secondary hover:border-cyan hover:text-cyan",
                  )}
                >
                  {type}
                </button>
              );
            })}
          </div>
        </div>

        {active ? (
          <button
            type="button"
            onClick={clear}
            className="label-mono self-start text-[11px] text-text-muted hover:text-cyan hover:underline"
          >
            Clear filters
          </button>
        ) : null}
      </Card>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-start gap-3 p-6">
          <p className="font-sans text-sm text-text-secondary">
            No sessions match these filters.
          </p>
          <button
            type="button"
            onClick={clear}
            className="label-mono text-[11px] text-cyan hover:underline"
          >
            Clear filters
          </button>
        </Card>
      ) : (
        <ol className="flex list-none flex-col gap-4 p-0">
          {filtered.map((entry) => {
            // The server (the one contiguity gate, ADR-0034) decides whether each record
            // may be deleted / un-completed and rides the verdict on the record, so the
            // control is disabled before the user clicks into a `409` (user story 27). An
            // absent flag (older payloads) leaves the control enabled — the server stays
            // authoritative and still rejects.
            const deleteDisabled = entry.deletable === false;
            const uncompleteDisabled = entry.uncompletable === false;
            return (
              <li key={entry.id}>
                <LoggedSessionCard
                  entry={entry}
                  deleteDisabled={deleteDisabled}
                  deleteReason={deleteDisabled ? DELETE_TAIL_FIRST_REASON : null}
                  uncompleteDisabled={uncompleteDisabled}
                  uncompleteReason={
                    uncompleteDisabled ? UNCOMPLETE_TAIL_FIRST_REASON : null
                  }
                />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function LoggedSessionCard({
  entry,
  deleteDisabled,
  deleteReason,
  uncompleteDisabled,
  uncompleteReason,
}: {
  entry: LoggedSession;
  deleteDisabled: boolean;
  deleteReason: string | null;
  uncompleteDisabled: boolean;
  uncompleteReason: string | null;
}): React.JSX.Element {
  // Shared pill styling for the Open / Edit link actions, so the whole cluster reads as
  // one row of tappable pills alongside the outcome toggle and delete controls.
  const pillClass =
    "label-mono inline-flex items-center rounded-md border border-border bg-elevated px-3 py-1.5 text-[10px] text-text-primary transition-colors hover:border-cyan hover:text-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 motion-reduce:transition-none";
  // The reuse shortcut wears the cyan accent (matching the record detail page's reuse action)
  // so it reads as the highlighted "do this again" affordance, not just another link.
  const reusePillClass =
    "label-mono inline-flex items-center gap-1.5 rounded-md border border-cyan/40 bg-cyan/[0.06] px-3 py-1.5 text-[10px] text-cyan transition-colors hover:bg-cyan/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 motion-reduce:transition-none";

  // One reuse affordance per record, from the shared seam — so the row and the detail page can
  // never disagree (ADR-0031/0044). Plan-backed → Repeat its existing plan (no copy); plan-less
  // → Capture into a new reusable plan. Present regardless of Completion Outcome.
  const reuse = sessionReuse(entry);

  return (
    <Card className="flex flex-col gap-4 p-5">
      {/* Title and date first, each on its own line (date nowrap so it never breaks in
          two), then the actions on a dedicated wrapping row of their own — so the two
          never collide or interleave on a narrow phone. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-semibold capitalize text-text-primary">
            {entry.training_type} session
          </h2>
          <span className="label-mono whitespace-nowrap text-[10px] text-text-muted">
            {entry.performed_on}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* A Completion Outcome rides only on a plan-backed record (ADR-0031); an
              ad-hoc record gates no Protocol, so it shows no outcome toggle. */}
          {entry.session_id !== null ? (
            <OutcomeToggle
              logId={entry.id}
              outcome={entry.completion_outcome}
              uncompleteDisabled={uncompleteDisabled}
              uncompleteReason={uncompleteReason}
            />
          ) : null}
          <Link href={`/history/${entry.id}`} className={pillClass}>
            Open
          </Link>
          {reuse.canRepeat && reuse.repeatHref !== null ? (
            <Link href={reuse.repeatHref} className={reusePillClass}>
              <Repeat className="h-3 w-3" />
              Repeat
            </Link>
          ) : (
            <Link href={reuse.captureHref} className={reusePillClass}>
              <Copy className="h-3 w-3" />
              Capture
            </Link>
          )}
          <Link href={`/history/${entry.id}/edit`} className={pillClass}>
            Edit
          </Link>
          <DeleteLogControl
            logId={entry.id}
            disabled={deleteDisabled}
            reason={deleteReason}
          />
        </div>
      </div>

      <LoggedSetTable sets={entry.logged_sets} />
    </Card>
  );
}
