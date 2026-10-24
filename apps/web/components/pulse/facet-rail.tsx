"use client";

import { useId, useState } from "react";

import type { ExerciseFacetList } from "@/lib/facet-rail";
import { trainingTypeFillClass } from "@/lib/training-type-accent";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/pulse/section-header";
import { ChevronDown, X } from "@/components/pulse/icons";

// The pieces a facet rail is built from (ADR-0139, ADR-0141), shared by History and My
// Sessions. From `lg:` the rail sits beside the results in the wide column (ADR-0088); below
// it, the rail folds behind a "Filters" disclosure, and the active facets stay on screen as
// removable tokens. One rail in the DOM either way: CSS alone moves it, so no id or heading is
// ever rendered twice. Each screen owns its projection (`*-facets` in `lib/`) and its sections;
// these pieces only render them.
export function FacetRailFrame({
  activeCount,
  tokens,
  onClear,
  rail,
  children,
}: {
  // How many facets are picked, for the phone's "Filters · n" summary and the Clear button.
  activeCount: number;
  // The active facets as `FacetToken`s, shown on a phone while the rail is closed.
  tokens: React.ReactNode;
  onClear: () => void;
  // The rail's `FacetSection`s.
  rail: React.ReactNode;
  // The results, placed beside the rail.
  children: React.ReactNode;
}): React.JSX.Element {
  const railId = useId();
  const [open, setOpen] = useState(false);
  const active = activeCount > 0;

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
          {active ? `Filters · ${activeCount}` : "Filters"}
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
            {tokens}
          </ul>
        ) : null}

        <div
          id={railId}
          className={cn(
            "flex-col gap-6 rounded-sm border border-border p-4 lg:flex lg:border-0 lg:p-0",
            open ? "flex" : "hidden",
          )}
        >
          {rail}

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

// One titled group of facet rows.
export function FacetSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-1">
      <SectionHeader className="pb-2">{title}</SectionHeader>
      {children}
    </section>
  );
}

// A search field inside a section, labelled for screen readers only — the section heading
// already names it on screen.
export function FacetFinder({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}): React.JSX.Element {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Input
        id={id}
        type="search"
        placeholder={placeholder}
        className="mb-1 h-9"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </>
  );
}

// The Exercise section both rails share: a finder, the rows `projectExerciseFacets` put on
// screen, and "Show all". The finder's text and "Show all" are local view state the parent owns
// (they feed the projection); they narrow the rail, never the results.
export function ExerciseFacetSection({
  list,
  kind,
  query,
  onQuery,
  expanded,
  onExpanded,
  onPick,
}: {
  list: ExerciseFacetList;
  // Which exercises the rail offers ("logged", "prescribed"), for the empty finder's copy.
  kind: string;
  query: string;
  onQuery: (query: string) => void;
  expanded: boolean;
  onExpanded: (expanded: boolean) => void;
  onPick: (exercise: string | null) => void;
}): React.JSX.Element {
  return (
    <FacetSection title="Exercise">
      <FacetFinder
        label="Find an exercise"
        placeholder="Find an exercise…"
        value={query}
        onChange={onQuery}
      />
      {list.exercises.map((facet) => (
        <FacetRow
          key={facet.name}
          label={facet.name}
          count={facet.count}
          selected={facet.selected}
          onClick={() => onPick(facet.selected ? null : facet.name)}
        />
      ))}
      {list.exercises.length === 0 ? (
        <p className="px-2 py-1.5 font-sans text-sm text-text-secondary">
          No {kind} exercise matches “{query.trim()}”.
        </p>
      ) : null}
      {list.hiddenExercises > 0 || (expanded && query.trim() === "") ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => onExpanded(!expanded)}
          className="label-mono self-start px-2 pt-1 text-[10px] text-text-muted hover:text-cyan"
        >
          {expanded ? "Show fewer" : `Show all · ${list.hiddenExercises} more`}
        </button>
      ) : null}
    </FacetSection>
  );
}

// One pickable facet: its name, and how many results picking it would show. A Training Type
// row also carries its accent (the Workout Signature's, never the only carrier of the type) and
// a hairline bar sized against the largest type; any other row may lead with an icon.
export function FacetRow({
  label,
  count,
  selected,
  onClick,
  type,
  share,
  icon,
  noun = "session",
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
  type?: string;
  share?: number;
  icon?: React.ReactNode;
  // What a count counts, for screen readers ("3 sessions").
  noun?: string;
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
      ) : (
        icon
      )}
      {/* An authored name wraps, never truncates (ADR-0085). */}
      <span className={cn("min-w-0 flex-1 break-words", type !== undefined && "capitalize")}>
        {label}
      </span>
      <span className="shrink-0 font-mono text-xs">
        {count}
        <span className="sr-only"> {count === 1 ? noun : `${noun}s`}</span>
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

// One active facet as a removable token, for the phone's collapsed rail.
export function FacetToken({
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
