"use client";

import { useDeferredValue, useState } from "react";

import type { SessionLibraryFilters, SessionSummary } from "@/lib/session-library";
import { projectSessionFacets } from "@/lib/sessions-facets";
import {
  ExerciseFacetSection,
  FacetFinder,
  FacetRailFrame,
  FacetRow,
  FacetSection,
  FacetToken,
} from "@/components/pulse/facet-rail";
import { Star } from "@/components/pulse/icons";

// My Sessions' filters as a facet rail (ADR-0141), built from the pieces History's rail uses
// (`pulse/facet-rail`, ADR-0139): a Name search, the Favorites toggle, each Training Type in the
// library and each Exercise its plans prescribe, every row counted off the already-fetched
// library at render time (`sessions-facets`).
//
// The rail adds no action and owns no filter: every row calls the screen's setters, and the URL
// stays the filter's address (ADR-0100). Only the exercise finder's text and "Show all" are
// local — they narrow the rail, not the library.
export function SessionsFacetRail({
  sessions,
  filters,
  counted,
  onQuery,
  onToggleFavorite,
  onToggleType,
  onExercise,
  onClear,
  children,
}: {
  sessions: SessionSummary[];
  // The live facets: what the controls show, so a keystroke or tap reads back at once.
  filters: SessionLibraryFilters;
  // The deferred facets the counts are projected from (ADR-0097).
  counted: SessionLibraryFilters;
  onQuery: (query: string) => void;
  onToggleFavorite: () => void;
  onToggleType: (type: string) => void;
  onExercise: (exercise: string | null) => void;
  onClear: () => void;
  // The results, placed beside the rail.
  children: React.ReactNode;
}): React.JSX.Element {
  const [finder, setFinder] = useState("");
  const [expanded, setExpanded] = useState(false);
  const deferredFinder = useDeferredValue(finder);
  const rail = projectSessionFacets(sessions, counted, { query: deferredFinder, expanded });
  const search = filters.query.trim();

  return (
    <FacetRailFrame
      activeCount={rail.activeCount}
      onClear={onClear}
      tokens={
        <>
          {search.length > 0 ? (
            <FacetToken label={`“${search}”`} onRemove={() => onQuery("")} />
          ) : null}
          {filters.favorite ? <FacetToken label="Favorites" onRemove={onToggleFavorite} /> : null}
          {filters.trainingTypes.map((type) => (
            <FacetToken key={type} label={type} type={type} onRemove={() => onToggleType(type)} />
          ))}
          {filters.exercise !== null ? (
            <FacetToken label={filters.exercise} onRemove={() => onExercise(null)} />
          ) : null}
        </>
      }
      rail={
        <>
          {/* Case-insensitive substring over Session Name, the derived fallback label, and
              Training Type — the same rule the server filters by (parity via
              `session-library`). */}
          <FacetSection title="Name">
            <FacetFinder
              label="Search sessions"
              placeholder="Search by name or type…"
              value={filters.query}
              onChange={onQuery}
            />
          </FacetSection>
          <FacetSection title="Favorites">
            <FacetRow
              label="Favorites"
              icon={<Star aria-hidden className="h-3 w-3 shrink-0" />}
              count={rail.favorite.count}
              selected={filters.favorite}
              onClick={onToggleFavorite}
            />
          </FacetSection>
          <FacetSection title="Training type">
            {rail.types.map((facet) => (
              <FacetRow
                key={facet.type}
                label={facet.type}
                count={facet.count}
                selected={filters.trainingTypes.includes(facet.type)}
                onClick={() => onToggleType(facet.type)}
                type={facet.type}
                share={facet.share}
              />
            ))}
          </FacetSection>
          <ExerciseFacetSection
            list={rail}
            kind="prescribed"
            query={finder}
            onQuery={setFinder}
            expanded={expanded}
            onExpanded={setExpanded}
            onPick={onExercise}
          />
        </>
      }
    >
      {children}
    </FacetRailFrame>
  );
}
