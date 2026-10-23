"use client";

import { useDeferredValue, useId, useState } from "react";

import type { HistoryIndexRow } from "@/lib/logs-types";
import type { HistoryFilters } from "@/lib/history-filter";
import { projectHistoryFacets } from "@/lib/history-facets";
import { trainingTypeFillClass } from "@/lib/training-type-accent";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/pulse/section-header";
import { ChevronDown, X } from "@/components/pulse/icons";

// History's filters as a facet rail (ADR-0139): every Training Type and every logged exercise,
// each with how many Logged Sessions picking it would show, read off the History index at render
// time (`history-facets`). From `lg:` the rail sits beside the results in the wide column
// (ADR-0088); below it, the rail folds behind a "Filters" disclosure, and the active facets stay
// on screen as removable tokens. One rail in the DOM either way: CSS alone moves it, so no id or
// heading is ever rendered twice.
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
  const railId = useId();
  const findId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  // The finder narrows a list of every logged exercise; the keystroke stays urgent and the
  // re-projection follows it (ADR-0097).
  const deferredQuery = useDeferredValue(query);
  const rail = projectHistoryFacets(index, filters, { query: deferredQuery, expanded });
  const active = rail.activeCount > 0;

  return (
    // Flex, not bracket tracks (ADR-0088): a stacked column below `lg:`, rail beside results above.
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <div className="flex min-w-0 flex-col gap-4 lg:w-64 lg:shrink-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={railId}
          onClick={() => setOpen(!open)}
          className="label-mono flex items-center justify-between rounded-sm border border-border px-4 py-3 text-[11px] text-text-secondary hover:border-cyan hover:text-cyan lg:hidden"
        >
          {active ? `Filters · ${rail.activeCount}` : "Filters"}
          <ChevronDown
            aria-hidden
            className={cn(
              "h-4 w-4 transition-transform motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </button>

        {/* Closed on a phone, the active facets stay visible — and removable — as tokens. */}
        {!open && active ? (
          <ul aria-label="Active filters" className="flex flex-wrap gap-1.5 lg:hidden">
            {filters.trainingTypes.map((type) => (
              <FacetToken key={type} label={type} type={type} onRemove={() => onToggleType(type)} />
            ))}
            {filters.exercise !== null ? (
              <FacetToken label={filters.exercise} onRemove={() => onExercise(null)} />
            ) : null}
          </ul>
        ) : null}

        <div
          id={railId}
          className={cn(
            "flex-col gap-6 rounded-sm border border-border p-4 lg:flex lg:border-0 lg:p-0",
            open ? "flex" : "hidden",
          )}
        >
          <section className="flex flex-col gap-1">
            <SectionHeader className="pb-2">Training type</SectionHeader>
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
          </section>

          <section className="flex flex-col gap-1">
            <SectionHeader className="pb-2">Exercise</SectionHeader>
            <label htmlFor={findId} className="sr-only">
              Find an exercise
            </label>
            <Input
              id={findId}
              type="search"
              placeholder="Find an exercise…"
              className="mb-1 h-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {rail.exercises.map((facet) => (
              <FacetRow
                key={facet.name}
                label={facet.name}
                count={facet.count}
                selected={facet.selected}
                onClick={() => onExercise(facet.selected ? null : facet.name)}
              />
            ))}
            {rail.exercises.length === 0 ? (
              <p className="px-2 py-1.5 font-sans text-sm text-text-secondary">
                No logged exercise matches “{query.trim()}”.
              </p>
            ) : null}
            {rail.hiddenExercises > 0 || (expanded && query.trim() === "") ? (
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
                className="label-mono self-start px-2 pt-1 text-[10px] text-text-muted hover:text-cyan"
              >
                {expanded ? "Show fewer" : `Show all · ${rail.hiddenExercises} more`}
              </button>
            ) : null}
          </section>

          {active ? (
            <button
              type="button"
              onClick={onClear}
              className="label-mono self-start text-[11px] text-text-muted hover:text-cyan hover:underline"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {/* `min-w-0`: a flex item's automatic minimum is its content (ADR-0085). */}
      <div className="flex min-w-0 flex-col gap-6 lg:flex-1">{children}</div>
    </div>
  );
}

// One pickable facet: its name, and how many Logged Sessions picking it would show. A Training
// Type row also carries its accent (the Workout Signature's, never the only carrier of the type)
// and a hairline bar sized against the largest type.
function FacetRow({
  label,
  count,
  selected,
  onClick,
  type,
  share,
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
  type?: string;
  share?: number;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-2 rounded-sm px-2 py-1.5 text-left font-sans text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 motion-reduce:transition-none",
        selected ? "bg-cyan-dim text-cyan" : "text-text-secondary hover:text-cyan",
      )}
    >
      {type !== undefined ? (
        <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", trainingTypeFillClass(type))} />
      ) : null}
      {/* An authored name wraps, never truncates (ADR-0085). */}
      <span className={cn("min-w-0 flex-1 break-words", type !== undefined && "capitalize")}>
        {label}
      </span>
      <span className="shrink-0 font-mono text-xs">
        {count}
        <span className="sr-only"> {count === 1 ? "session" : "sessions"}</span>
      </span>
      {share !== undefined && type !== undefined ? (
        <span
          aria-hidden
          className={cn("absolute bottom-0 left-2 h-px", trainingTypeFillClass(type))}
          style={{ width: `calc((100% - 1rem) * ${share})` }}
        />
      ) : null}
    </button>
  );
}

function FacetToken({
  label,
  type,
  onRemove,
}: {
  label: string;
  type?: string;
  onRemove: () => void;
}): React.JSX.Element {
  return (
    <li className="inline-flex min-w-0 items-center gap-1.5 rounded-sm border border-cyan/40 bg-cyan-dim py-0.5 pl-2.5 pr-1 font-mono text-xs text-cyan">
      {type !== undefined ? (
        <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", trainingTypeFillClass(type))} />
      ) : null}
      <span className={cn("min-w-0 break-words", type !== undefined && "capitalize")}>{label}</span>
      <button
        type="button"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:text-text-primary"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </li>
  );
}
