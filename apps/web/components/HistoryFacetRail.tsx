"use client";

import { useDeferredValue, useState } from "react";

import type { HistoryIndexRow } from "@/lib/logs-types";
import type { HistoryFilters } from "@/lib/history-filter";
import { projectHistoryFacets } from "@/lib/history-facets";
import {
  ExerciseFacetSection,
  FacetRailFrame,
  FacetRow,
  FacetSection,
  FacetToken,
} from "@/components/pulse/facet-rail";

// History's filters as a facet rail (ADR-0139): every Training Type and every logged exercise,
// each with how many Logged Sessions picking it would show, read off the History index at render
// time (`history-facets`). The frame, rows and tokens are shared with My Sessions
// (`pulse/facet-rail`, ADR-0141).
//
// The rail adds no action: picking a row calls the same setters the screen always had, and the
// URL stays the filter's address (ADR-0100). Only the finder's text and "Show all" are local —
// they narrow the rail, not the record.
export function HistoryFacetRail({
  index,
  filters,
  onExercise,
  onToggleType,
  onClear,
  children,
}: {
  index: HistoryIndexRow[];
  filters: HistoryFilters;
  onExercise: (exercise: string | null) => void;
  onToggleType: (type: string) => void;
  onClear: () => void;
  // The results — Month view's grid and list — placed beside the rail.
  children: React.ReactNode;
}): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  // The finder narrows a list of every logged exercise; the keystroke stays urgent and the
  // re-projection follows it (ADR-0097).
  const deferredQuery = useDeferredValue(query);
  const rail = projectHistoryFacets(index, filters, { query: deferredQuery, expanded });

  return (
    <FacetRailFrame
      activeCount={rail.activeCount}
      onClear={onClear}
      tokens={
        <>
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
          <FacetSection title="Training type">
            {rail.types.map((facet) => (
              <FacetRow
                key={facet.type}
                label={facet.type}
                count={facet.count}
                selected={facet.selected}
                onClick={() => onToggleType(facet.type)}
                type={facet.type}
                share={facet.share}
              />
            ))}
          </FacetSection>
          <ExerciseFacetSection
            list={rail}
            kind="logged"
            query={query}
            onQuery={setQuery}
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
