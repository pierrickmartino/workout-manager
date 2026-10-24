"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  EMPTY_SESSION_FILTERS,
  filterSessions,
  hasActiveSessionFilters,
  parseSessionFilters,
  sessionFiltersToQuery,
  type SessionLibraryFilters,
  type SessionSummary,
} from "@/lib/session-library";
import { replaceFilterQuery } from "@/lib/filter-url";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { SessionCardRow } from "@/components/SessionCardRow";
import { SessionsFacetRail } from "@/components/SessionsFacetRail";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// The interactive My Sessions library (GLOSSARY: My Sessions, issue #397): the user's own
// standalone Sessions, narrowed from a facet rail (ADR-0141) — a Name search, Favorites, any
// Training Types and one prescribed Exercise, combined with AND. Filtering is entirely
// client-side over the already-fetched library (like History) — the filter state lives in React
// and every keystroke or tap re-filters in-browser, never re-fetching. All matching and counting
// lives in `session-library` / `sessions-facets`; this component only wires the controls to it.
// Favoriting a row is the one write: a server action that revalidates.
export function SessionsLibrary({
  sessions,
}: {
  sessions: SessionSummary[];
}): React.JSX.Element {
  // Seed once from the URL, then own the state locally — a filter change re-filters the
  // already-fetched library in-browser and is mirrored back into the URL below, never
  // re-running the Server Component (the History pattern).
  const initialParams = useSearchParams();
  const [filters, setFilters] = useState<SessionLibraryFilters>(() =>
    parseSessionFilters(new URLSearchParams(initialParams.toString())),
  );
  // The controls read `filters`; the list, the counts and the badge read the deferred copy, so
  // a keystroke stays urgent and the re-filter follows it (ADR-0097).
  const deferred = useDeferredValue(filters);

  // Mirror the active filters into the shareable URL without a navigation, so a refresh or
  // shared link restores the narrowed view and Back from an opened Session returns to it.
  // `replaceState` (not a router push) keeps the Server Component and its one-shot library
  // fetch from re-running on a keystroke or tap.
  useEffect(() => {
    replaceFilterQuery(sessionFiltersToQuery(filters));
  }, [filters]);
  const filtered = useMemo(
    () => filterSessions(sessions, deferred),
    [sessions, deferred],
  );
  const active = hasActiveSessionFilters(deferred);

  function setQuery(query: string): void {
    setFilters((current) => ({ ...current, query }));
  }

  function toggleFavorite(): void {
    setFilters((current) => ({ ...current, favorite: !current.favorite }));
  }

  function toggleType(type: string): void {
    setFilters((current) => ({
      ...current,
      trainingTypes: current.trainingTypes.includes(type)
        ? current.trainingTypes.filter((t) => t !== type)
        : [...current.trainingTypes, type],
    }));
  }

  function setExercise(exercise: string | null): void {
    setFilters((current) => ({ ...current, exercise }));
  }

  function clear(): void {
    setFilters(EMPTY_SESSION_FILTERS);
  }

  return (
    // My Sessions opts into the wide content column (ADR-0088): from `lg:` the facet rail sits
    // beside the results (ADR-0141). Below `lg:` nothing is wider.
    <section className="flex flex-col gap-6" data-shell="wide">
      <PageHeader
        overline="PULSE // TRAIN"
        title="My sessions"
        action={
          // The filtered count with total context when a filter is active, else the plain
          // total — so a narrowed list never looks like a shrunken library.
          <Badge variant="muted">
            {active
              ? `${filtered.length} of ${sessions.length}`
              : sessions.length}{" "}
            SESSIONS
          </Badge>
        }
      />

      <SessionsFacetRail
        sessions={sessions}
        filters={filters}
        counted={deferred}
        onQuery={setQuery}
        onToggleFavorite={toggleFavorite}
        onToggleType={toggleType}
        onExercise={setExercise}
        onClear={clear}
      >
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
            {filtered.map((session) => (
              <li key={session.id}>
                <SessionCardRow session={session} />
              </li>
            ))}
          </ol>
        )}
      </SessionsFacetRail>

      <BackLink href="/train">Back to train</BackLink>
    </section>
  );
}
