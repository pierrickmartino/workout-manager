"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import type { HistoryIndexRow } from "@/lib/logs-types";
import type { WeightUnit } from "@/lib/weight-unit";
import {
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
import { replaceFilterQuery } from "@/lib/filter-url";
import { PageHeader } from "@/components/pulse/page-header";
import { Badge } from "@/components/ui/badge";
import { HistoryCardList } from "@/components/HistoryCardList";
import { HistoryColumns } from "@/components/HistoryColumns";
import { HistoryMonthView } from "@/components/HistoryMonthView";
import { HistoryFacetRail } from "@/components/HistoryFacetRail";
import { NAV_FORWARD } from "@/lib/nav-direction";

// The interactive History screen: filter by exercise and Training Type over the record
// (ADR-0031), picked from a facet rail that counts each option (ADR-0139). Filtering is entirely
// client-side over the History index (Q4) — the filter state lives in React and is mirrored into
// the URL with `history.replaceState` (Q8) rather than a router navigation, so a pick never
// re-runs the Server Component or re-reads the history. The URL round-trips through `history-filter`, so a shared or refreshed
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

  function setExercise(exercise: string | null): void {
    applyFacets({ exercise });
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
    // History opts into the wide content column (ADR-0088): from `lg:` the facet rail sits
    // beside the results in both views (ADR-0139). Below `lg:` nothing is wider.
    <section className="flex flex-col gap-6" data-shell="wide">
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

      <HistoryFacetRail
        index={index}
        filters={filters}
        onExercise={setExercise}
        onToggleType={toggleType}
        onClear={clear}
        onView={setView}
      >
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
      </HistoryFacetRail>
    </section>
  );
}

