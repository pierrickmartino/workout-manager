"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Copy, Repeat } from "@/components/pulse/icons";

import type { HistoryIndexRow } from "@/lib/logs-types";
import type { WeightUnit } from "@/lib/weight-unit";
import { TRAINING_TYPES } from "@/lib/sessions-types";
import {
  deriveExerciseOptions,
  filterHistory,
  hasActiveFilters,
  historyFiltersToQuery,
  parseHistoryFilters,
  type HistoryFilters,
} from "@/lib/history-filter";
import {
  INITIAL_HISTORY_WINDOW_STATE,
  historyWindowReducer,
  planHistoryWindow,
  resolveHistoryCards,
  type HistoryCard,
} from "@/lib/history-window";
import { fetchHistoryCards } from "@/app/history/history-cards-action";
import { sessionReuse } from "@/lib/session-reuse";
import {
  DELETE_TAIL_FIRST_REASON,
  UNCOMPLETE_TAIL_FIRST_REASON,
} from "@/lib/log-correction-reasons";
import { cn } from "@/lib/utils";
import { replaceFilterQuery } from "@/lib/filter-url";
import { PageHeader } from "@/components/pulse/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DeleteLogControl } from "@/components/DeleteLogControl";
import { OutcomeToggle } from "@/components/OutcomeToggle";
import { LoggedSetTable } from "@/components/LoggedSetTable";
import { NAV_FORWARD } from "@/lib/nav-direction";

// The interactive History screen: search by exercise + filter by Training Type over the
// record (ADR-0031). Filtering is entirely client-side over the History index (Q4) — the
// filter state lives in React and is mirrored into the URL with `history.replaceState` (Q8)
// rather than a router navigation, so a keystroke never re-runs the Server Component or
// re-reads the history. The URL round-trips through `history-filter`, so a shared or refreshed
// link restores the same view.
//
// Full records arrive in windows (ADR-0128): the server renders the first window, and the
// window view-model decides which visible matches still need fetching — after "Show more", or
// after a filter change reveals matches the client does not hold yet. All matching and window
// logic lives in `history-filter` / `history-window`; this component only wires them up.
export function HistoryBrowser({
  index,
  firstWindow,
  unit,
}: {
  // Every Logged Session, newest first, with its filterable fields and correction verdicts.
  index: HistoryIndexRow[];
  // The full records of the first window, rendered by the server.
  firstWindow: HistoryCard[];
  // The reader's Weight Unit, forwarded to each record's set table (#417).
  unit: WeightUnit;
}): React.JSX.Element {
  // Seed once from the URL, then own the state locally (see the replaceState note above).
  const initialParams = useSearchParams();
  const [filters, setFilters] = useState<HistoryFilters>(() =>
    parseHistoryFilters(new URLSearchParams(initialParams.toString())),
  );
  const [windowState, dispatch] = useReducer(
    historyWindowReducer,
    INITIAL_HISTORY_WINDOW_STATE,
  );

  const exerciseOptions = useMemo(() => deriveExerciseOptions(index), [index]);
  const filtered = useMemo(() => filterHistory(index, filters), [index, filters]);
  const cards = useMemo(
    () => resolveHistoryCards(windowState.fetched, firstWindow),
    [windowState.fetched, firstWindow],
  );
  const view = planHistoryWindow(filtered, cards, windowState);
  const active = hasActiveFilters(filters);

  // Fetch the visible matches the client does not hold yet. Keyed on the ids themselves, so
  // marking them in flight (which empties `toRequest`) does not re-run the read. A response
  // is merged whenever it lands; nothing is cancelled (see `historyWindowReducer`).
  const requestKey = view.toRequest.join(",");
  useEffect(() => {
    if (requestKey === "") return;
    const ids = requestKey.split(",").map(Number);
    dispatch({ type: "requested", ids });
    fetchHistoryCards(ids)
      .then((result) =>
        dispatch(
          result.cards === null
            ? { type: "failed", ids }
            : { type: "succeeded", ids, cards: result.cards },
        ),
      )
      .catch(() => dispatch({ type: "failed", ids }));
  }, [requestKey]);

  function apply(next: HistoryFilters): void {
    setFilters(next);
    dispatch({ type: "filters-changed" });
    // Update the shareable URL without a navigation, so the Server Component and its index
    // read are never re-run by a filter change (Q4/Q8).
    replaceFilterQuery(historyFiltersToQuery(next));
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
          <div className="flex flex-wrap items-center gap-3">
            <Link
              {...NAV_FORWARD}
              href="/logs/new"
              className="label-mono text-[11px] text-cyan hover:underline"
            >
              + Log an exercise
            </Link>
            {/* Filtered count with total context when a facet is active, else the plain
                total (Q9) — so a narrowed list never looks like a shrunken history. */}
            <Badge variant="muted">
              {active
                ? `${filtered.length} of ${index.length}`
                : index.length}{" "}
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
            placeholder="Any exercise…"
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
          {view.entries.map(({ card, deletable, uncompletable }) => {
            // The server (the one contiguity gate, ADR-0034) decides whether each record
            // may be deleted / un-completed; the verdict rides on the index row, which is
            // re-read on every revalidation, so the control is disabled before the user
            // clicks into a `409` (user story 27). The server stays authoritative.
            const deleteDisabled = !deletable;
            const uncompleteDisabled = !uncompletable;
            return (
              // Off-screen cards skip layout and paint but stay in the DOM and the
              // accessibility tree (ADR-0097).
              <li key={card.id} className="history-row-defer">
                <LoggedSessionCard
                  entry={card}
                  unit={unit}
                  deleteDisabled={deleteDisabled}
                  deleteReason={deleteDisabled ? DELETE_TAIL_FIRST_REASON : null}
                  uncompleteDisabled={uncompleteDisabled}
                  uncompleteReason={
                    uncompleteDisabled ? UNCOMPLETE_TAIL_FIRST_REASON : null
                  }
                  onCorrected={(corrected) =>
                    dispatch({ type: "corrected", card: corrected })
                  }
                />
              </li>
            );
          })}
          <HistoryWindowStatus
            pendingCount={view.pendingCount}
            failedCount={view.failedCount}
            hiddenCount={view.hiddenCount}
            onRetry={() => dispatch({ type: "retry" })}
            onShowMore={() => dispatch({ type: "show-more" })}
          />
        </ol>
      )}
    </section>
  );
}

// The row after the last card: what is still loading, a failed window with its retry, or the
// "Show more" control. Renders nothing when every match is on screen.
function HistoryWindowStatus({
  pendingCount,
  failedCount,
  hiddenCount,
  onRetry,
  onShowMore,
}: {
  pendingCount: number;
  failedCount: number;
  hiddenCount: number;
  onRetry: () => void;
  onShowMore: () => void;
}): React.JSX.Element | null {
  if (failedCount > 0) {
    return (
      <li className="flex flex-wrap items-center gap-3">
        <span role="alert" className="font-sans text-sm text-magenta">
          Could not load {failedCount} {failedCount === 1 ? "session" : "sessions"}.
        </span>
        <button
          type="button"
          onClick={onRetry}
          className="label-mono text-[11px] text-cyan hover:underline"
        >
          Try again
        </button>
      </li>
    );
  }
  if (pendingCount > 0) {
    return (
      <li role="status" className="label-mono text-[11px] text-text-muted">
        Loading {pendingCount} more…
      </li>
    );
  }
  if (hiddenCount > 0) {
    return (
      <li>
        <button
          type="button"
          onClick={onShowMore}
          className="label-mono rounded-md border border-border bg-elevated px-3 py-1.5 text-[10px] text-text-primary transition-colors hover:border-cyan hover:text-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 motion-reduce:transition-none"
        >
          Show more ({hiddenCount} older)
        </button>
      </li>
    );
  }
  return null;
}

function LoggedSessionCard({
  entry,
  unit,
  deleteDisabled,
  deleteReason,
  uncompleteDisabled,
  uncompleteReason,
  onCorrected,
}: {
  entry: HistoryCard;
  unit: WeightUnit;
  deleteDisabled: boolean;
  deleteReason: string | null;
  uncompleteDisabled: boolean;
  uncompleteReason: string | null;
  onCorrected: (card: HistoryCard) => void;
}): React.JSX.Element {
  // Shared pill styling for the Open / Edit link actions, so the whole cluster reads as
  // one row of tappable pills alongside the outcome toggle and delete controls.
  const pillClass =
    "label-mono inline-flex items-center rounded-md border border-border bg-elevated px-3 py-1.5 text-[10px] text-text-primary transition-colors hover:border-cyan hover:text-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 motion-reduce:transition-none";
  // The reuse shortcut wears the cyan accent (matching the record detail page's reuse action)
  // so it reads as the highlighted "do this again" affordance, not just another link.
  const reusePillClass =
    "label-mono inline-flex items-center gap-1.5 rounded-md border border-cyan/40 bg-cyan-dim px-3 py-1.5 text-[10px] text-cyan transition-colors hover:border-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 motion-reduce:transition-none";

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
          <h2 className="text-balance font-display text-lg font-semibold capitalize text-text-primary">
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
              onCorrected={onCorrected}
            />
          ) : null}
          <Link {...NAV_FORWARD} href={`/history/${entry.id}`} className={pillClass}>
            Open
          </Link>
          {reuse.canRepeat && reuse.repeatHref !== null ? (
            <Link {...NAV_FORWARD} href={reuse.repeatHref} className={reusePillClass}>
              <Repeat className="h-3 w-3" />
              Repeat
            </Link>
          ) : (
            <Link {...NAV_FORWARD} href={reuse.captureHref} className={reusePillClass}>
              <Copy className="h-3 w-3" />
              Capture
            </Link>
          )}
          <Link {...NAV_FORWARD} href={`/history/${entry.id}/edit`} className={pillClass}>
            Edit
          </Link>
          <DeleteLogControl
            logId={entry.id}
            disabled={deleteDisabled}
            reason={deleteReason}
          />
        </div>
      </div>

      <LoggedSetTable sets={entry.logged_sets} unit={unit} />
    </Card>
  );
}
