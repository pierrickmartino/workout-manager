"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import type { HistoryIndexRow } from "@/lib/logs-types";
import type { WeightUnit } from "@/lib/weight-unit";
import { TRAINING_TYPES } from "@/lib/sessions-types";
import {
  deriveExerciseOptions,
  filterHistory,
  hasActiveFilters,
  historyFiltersToQuery,
  parseHistoryFilters,
  type HistoryFacets,
  type HistoryFilters,
  type HistoryView,
} from "@/lib/history-filter";
import { pinVisibleMonth, projectHistoryMonth } from "@/lib/history-month";
import {
  INITIAL_HISTORY_WINDOW_STATE,
  historyWindowReducer,
  planHistoryWindow,
  resolveHistoryCards,
  type HistoryCard,
} from "@/lib/history-window";
import { fetchHistoryCards } from "@/app/history/history-cards-action";
import { cn } from "@/lib/utils";
import { replaceFilterQuery } from "@/lib/filter-url";
import { PageHeader } from "@/components/pulse/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { HistoryCardList } from "@/components/HistoryCardList";
import { HistoryColumns } from "@/components/HistoryColumns";
import { HistoryMonthView } from "@/components/HistoryMonthView";
import { HistoryViewToggle } from "@/components/HistoryViewToggle";
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
//
// Month view (ADR-0138) narrows the same record to one month, read off `performed_on`; its
// projection lives in `history-month`, and its matches feed the same window loader.
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
  const month = useMemo(
    () => (filters.view === "month" ? projectHistoryMonth(index, filters) : null),
    [index, filters],
  );
  const matches = month?.visible ?? filtered;
  const windowPlan = planHistoryWindow(matches, cards, windowState);
  const active = hasActiveFilters(filters);

  // Fetch the visible matches the client does not hold yet. Keyed on the ids themselves, so
  // marking them in flight (which empties `toRequest`) does not re-run the read. A response
  // is merged whenever it lands; nothing is cancelled (see `historyWindowReducer`).
  const requestKey = windowPlan.toRequest.join(",");
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

  // A facet change keeps Month view on the month on screen, even when it empties it: the month
  // is pinned before the facets move, so it is never re-resolved under the reader (ADR-0138).
  function applyFacets(facets: Partial<HistoryFacets>): void {
    apply({ ...pinVisibleMonth(index, filters), ...facets });
  }

  function setExercise(value: string): void {
    applyFacets({ exercise: value.length > 0 ? value : null });
  }

  function toggleType(type: string): void {
    const trainingTypes = filters.trainingTypes.includes(type)
      ? filters.trainingTypes.filter((t) => t !== type)
      : [...filters.trainingTypes, type];
    applyFacets({ trainingTypes });
  }

  // Clearing the facets keeps the view and the month on screen.
  function clear(): void {
    applyFacets({ exercise: null, trainingTypes: [] });
  }

  // The List has no month and no day. Month view opens on the newest matching month and pins it
  // into the URL straight away (ADR-0138). The exercise / type facets carry over either way.
  function setView(next: HistoryView): void {
    if (next === filters.view) return;
    apply(pinVisibleMonth(index, { ...filters, view: next, month: null, day: null }));
  }

  // The month arrows: the projection only offers months inside the record's bounds. A new
  // month always clears the day, so a selection never points at a month off screen.
  function goToMonth(next: string): void {
    apply({ ...filters, month: next, day: null });
  }

  // A day tap, or "Show all of <Month>" (null). The day lives inside the month on screen, so
  // the month is pinned with it.
  function selectDay(day: string | null): void {
    apply({ ...pinVisibleMonth(index, filters), day });
  }

  // The cards, or the empty state when nothing matches: the same in both views. Month view
  // sets them beside its grid from `lg:` (ADR-0138); the List renders them as it always has.
  const list = (
    <HistoryCardList
      windowPlan={windowPlan}
      isEmpty={matches.length === 0}
      emptyMessage={month !== null ? month.summary : "No sessions match these filters."}
      onClear={active ? clear : undefined}
      unit={unit}
      onCorrected={(corrected) => dispatch({ type: "corrected", card: corrected })}
      onRetry={() => dispatch({ type: "retry" })}
      onShowMore={() => dispatch({ type: "show-more" })}
    />
  );

  return (
    // Month view opts History into the wide content column (ADR-0088). The List does not, so
    // its layout is unchanged at every width.
    <section
      className="flex flex-col gap-6"
      data-shell={month !== null ? "wide" : undefined}
    >
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
        <HistoryViewToggle view={filters.view} onChange={setView} />

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

      {month !== null ? (
        <HistoryColumns
          grid={
            <HistoryMonthView
              projection={month}
              onNavigate={goToMonth}
              onSelectDay={selectDay}
            />
          }
          list={list}
        />
      ) : (
        list
      )}
    </section>
  );
}

