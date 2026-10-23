"use client";

// PROTOTYPE — throwaway, not for main. Question: what should the filters on the Training history
// page look like? Five variants on the real `/history` route, switched with `?variant=` and the
// floating bar (← / → keys), hidden in production builds:
//
//   A Current     — the shipped filter card (baseline)
//   B Toolbar     — one dense, sticky row: search · type chips · layout switch; no card
//   C Omnibox     — a single search box suggesting exercises AND types; picks become tokens
//   D Sentence    — the filter reads as a sentence: "Show strength or cardio sessions with …"
//   E Facet rail  — a side rail with live counts per type and per exercise (a disclosure on a
//                   phone), so the filter also shows what is in the record
//
// Every variant drives the same `HistoryBrowser` state through the same callbacks; only the
// rendering differs. Each owns its layout, so it receives the results (`children`) to place.
// No tests, no polish: pick one (or steal bits), then fold it in properly.

import { useMemo, useState } from "react";

import type { HistoryIndexRow } from "@/lib/logs-types";
import { TRAINING_TYPES } from "@/lib/sessions-types";
import {
  filterHistory,
  type HistoryFilters,
  type HistoryView,
} from "@/lib/history-filter";
import { trainingTypeFillClass } from "@/lib/training-type-accent";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { HistoryViewToggle } from "@/components/HistoryViewToggle";
import { ChevronDown, Search, X } from "@/components/pulse/icons";

export const FILTER_VARIANTS = [
  { key: "A", name: "Current" },
  { key: "B", name: "Toolbar" },
  { key: "C", name: "Omnibox" },
  { key: "D", name: "Sentence" },
  { key: "E", name: "Facet rail" },
] as const;

export interface FilterVariantProps {
  index: HistoryIndexRow[];
  filters: HistoryFilters;
  exerciseOptions: string[];
  matchCount: number;
  active: boolean;
  onExercise: (value: string | null) => void;
  onToggleType: (type: string) => void;
  onSetTypes: (types: string[]) => void;
  onClear: () => void;
  onView: (view: HistoryView) => void;
  // The cards / Month view, for the variant to place.
  children: React.ReactNode;
}

const CHIP =
  "label-mono rounded-sm border px-3 py-1.5 text-[10px] capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 motion-reduce:transition-none";
const CHIP_ON = "border-cyan/40 bg-cyan-dim text-cyan";
const CHIP_OFF =
  "border-border text-text-secondary hover:border-cyan hover:text-cyan";

function TypeDot({ type }: { type: string }): React.JSX.Element {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-full",
        trainingTypeFillClass(type),
      )}
    />
  );
}

// Faceted counts: how many sessions each option would leave, given the *other* facet.
function useFacetCounts(index: HistoryIndexRow[], filters: HistoryFilters) {
  return useMemo(() => {
    const byExercise = filterHistory(index, {
      exercise: null,
      trainingTypes: filters.trainingTypes,
    });
    const exerciseCounts = new Map<string, number>();
    for (const row of byExercise) {
      for (const name of row.exercise_names) {
        exerciseCounts.set(name, (exerciseCounts.get(name) ?? 0) + 1);
      }
    }
    const byType = filterHistory(index, {
      exercise: filters.exercise,
      trainingTypes: [],
    });
    const typeCounts = new Map<string, number>();
    for (const row of byType) {
      typeCounts.set(
        row.training_type,
        (typeCounts.get(row.training_type) ?? 0) + 1,
      );
    }
    return { exerciseCounts, typeCounts };
  }, [index, filters.exercise, filters.trainingTypes]);
}

// ── A · Current ─────────────────────────────────────────────────────────────────────────────

export function VariantCurrent(props: FilterVariantProps): React.JSX.Element {
  const {
    filters,
    exerciseOptions,
    active,
    onExercise,
    onToggleType,
    onClear,
    onView,
  } = props;
  return (
    <>
      <Card className="flex flex-col gap-4 p-4">
        <HistoryViewToggle view={filters.view} onChange={onView} />
        <div className="flex flex-col gap-2">
          <label
            htmlFor="proto-a-exercise"
            className="label-mono text-[10px] text-text-muted"
          >
            EXERCISE
          </label>
          <Input
            id="proto-a-exercise"
            type="search"
            list="proto-a-exercise-options"
            placeholder="Any exercise…"
            value={filters.exercise ?? ""}
            onChange={(event) => onExercise(event.target.value || null)}
          />
          <datalist id="proto-a-exercise-options">
            {exerciseOptions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-col gap-2">
          <span className="label-mono text-[10px] text-text-muted">
            TRAINING TYPE
          </span>
          <div className="flex flex-wrap gap-2">
            {TRAINING_TYPES.map((type) => {
              const on = filters.trainingTypes.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggleType(type)}
                  className={cn(CHIP, on ? CHIP_ON : CHIP_OFF)}
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
            onClick={onClear}
            className="label-mono self-start text-[11px] text-text-muted hover:text-cyan hover:underline"
          >
            Clear filters
          </button>
        ) : null}
      </Card>
      {props.children}
    </>
  );
}

// ── B · Toolbar ─────────────────────────────────────────────────────────────────────────────
// No card, no labels: one compact row that sticks under the header while the list scrolls.
// Types scroll sideways on a phone instead of wrapping into a block.

export function VariantToolbar(props: FilterVariantProps): React.JSX.Element {
  const {
    filters,
    exerciseOptions,
    active,
    onExercise,
    onToggleType,
    onClear,
    onView,
  } = props;
  return (
    <>
      <div className="sticky top-0 z-20 -mx-4 flex flex-col gap-2 border-b border-border bg-base/95 px-4 py-2 backdrop-blur lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            />
            <Input
              aria-label="Exercise"
              type="search"
              list="proto-b-exercise-options"
              placeholder="Exercise…"
              className="h-9 pl-9"
              value={filters.exercise ?? ""}
              onChange={(event) => onExercise(event.target.value || null)}
            />
            <datalist id="proto-b-exercise-options">
              {exerciseOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          <div className="shrink-0 lg:hidden">
            <HistoryViewToggle view={filters.view} onChange={onView} />
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <div
            role="group"
            aria-label="Training type"
            className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
          >
            {TRAINING_TYPES.map((type) => {
              const on = filters.trainingTypes.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggleType(type)}
                  className={cn(
                    CHIP,
                    "shrink-0 rounded-full px-2.5 py-1",
                    on ? CHIP_ON : CHIP_OFF,
                  )}
                >
                  {type}
                </button>
              );
            })}
          </div>
          {active ? (
            <button
              type="button"
              aria-label="Clear filters"
              onClick={onClear}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted hover:text-cyan"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
          <div className="hidden shrink-0 lg:block">
            <HistoryViewToggle view={filters.view} onChange={onView} />
          </div>
        </div>
      </div>
      {props.children}
    </>
  );
}

// ── C · Omnibox ─────────────────────────────────────────────────────────────────────────────
// One field for everything. Typing suggests both exercises and Training Types (with counts);
// each pick becomes a removable token. The layout switch moves out to tabs over the results.

export function VariantOmnibox(props: FilterVariantProps): React.JSX.Element {
  const {
    index,
    filters,
    exerciseOptions,
    active,
    onExercise,
    onToggleType,
    onClear,
    onView,
  } = props;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const { exerciseCounts, typeCounts } = useFacetCounts(index, filters);

  const needle = query.trim().toLowerCase();
  const typeHits = TRAINING_TYPES.filter(
    (type) => !filters.trainingTypes.includes(type) && type.includes(needle),
  );
  const exerciseHits = exerciseOptions
    .filter(
      (name) =>
        name !== filters.exercise && name.toLowerCase().includes(needle),
    )
    .slice(0, 6);

  function pickType(type: string): void {
    onToggleType(type);
    setQuery("");
  }
  function pickExercise(name: string): void {
    onExercise(name);
    setQuery("");
    setOpen(false);
  }

  return (
    <>
      <div className="relative">
        <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-sm border border-border-lite bg-surface px-3 py-1.5 focus-within:border-cyan focus-within:ring-1 focus-within:ring-cyan">
          <Search aria-hidden className="h-4 w-4 shrink-0 text-text-muted" />
          {filters.trainingTypes.map((type) => (
            <Token
              key={type}
              label={type}
              dot={type}
              onRemove={() => onToggleType(type)}
            />
          ))}
          {filters.exercise !== null ? (
            <Token label={filters.exercise} onRemove={() => onExercise(null)} />
          ) : null}
          <input
            aria-label="Filter history"
            type="search"
            spellCheck={false}
            autoComplete="off"
            placeholder={
              active ? "Add a filter…" : "Filter by exercise or type…"
            }
            className="h-8 min-w-[8rem] flex-1 bg-transparent font-mono text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
            value={query}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Backspace" && query === "") {
                if (filters.exercise !== null) onExercise(null);
                else if (filters.trainingTypes.length > 0)
                  onToggleType(
                    filters.trainingTypes[filters.trainingTypes.length - 1],
                  );
              }
              if (event.key === "Enter") {
                if (typeHits[0] && needle.length > 0) pickType(typeHits[0]);
                else if (exerciseHits[0]) pickExercise(exerciseHits[0]);
              }
            }}
          />
          {active ? (
            <button
              type="button"
              onClick={onClear}
              className="label-mono shrink-0 text-[10px] text-text-muted hover:text-cyan"
            >
              CLEAR
            </button>
          ) : null}
        </div>
        {open && (typeHits.length > 0 || exerciseHits.length > 0) ? (
          <div className="absolute inset-x-0 top-full z-30 mt-1 flex flex-col rounded-sm border border-border bg-elevated py-1 shadow-2xl">
            {typeHits.length > 0 ? (
              <SuggestHeading>TRAINING TYPE</SuggestHeading>
            ) : null}
            {typeHits.map((type) => (
              <SuggestRow
                key={type}
                onPick={() => pickType(type)}
                count={typeCounts.get(type) ?? 0}
              >
                <TypeDot type={type} />
                <span className="capitalize">{type}</span>
              </SuggestRow>
            ))}
            {exerciseHits.length > 0 ? (
              <SuggestHeading>EXERCISE</SuggestHeading>
            ) : null}
            {exerciseHits.map((name) => (
              <SuggestRow
                key={name}
                onPick={() => pickExercise(name)}
                count={exerciseCounts.get(name) ?? 0}
              >
                {name}
              </SuggestRow>
            ))}
          </div>
        ) : null}
      </div>

      <div
        role="tablist"
        aria-label="History layout"
        className="flex gap-6 border-b border-border"
      >
        {(["list", "month"] as const).map((view) => {
          const on = filters.view === view;
          return (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onView(view)}
              className={cn(
                "label-mono -mb-px border-b-2 pb-2 text-[11px] transition-colors motion-reduce:transition-none",
                on
                  ? "border-cyan text-cyan"
                  : "border-transparent text-text-secondary hover:text-cyan",
              )}
            >
              {view === "list" ? "LIST" : "MONTH"}
            </button>
          );
        })}
      </div>
      {props.children}
    </>
  );
}

function Token({
  label,
  dot,
  onRemove,
}: {
  label: string;
  dot?: string;
  onRemove: () => void;
}): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan/40 bg-cyan-dim py-0.5 pl-2.5 pr-1 font-mono text-xs text-cyan">
      {dot ? <TypeDot type={dot} /> : null}
      <span className={dot ? "capitalize" : undefined}>{label}</span>
      <button
        type="button"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-base"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}

function SuggestHeading({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <span className="label-mono px-3 pb-1 pt-2 text-[10px] text-text-muted">
      {children}
    </span>
  );
}

function SuggestRow({
  children,
  count,
  onPick,
}: {
  children: React.ReactNode;
  count: number;
  onPick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
      className="flex items-center gap-2 px-3 py-2 text-left font-sans text-sm text-text-primary hover:bg-surface"
    >
      {children}
      <span className="ml-auto font-mono text-xs text-text-muted">{count}</span>
    </button>
  );
}

// ── D · Sentence ────────────────────────────────────────────────────────────────────────────
// The filter *is* the summary: a sentence whose blanks are the controls. No labels, no card;
// what you see is what you asked for, and the count sits inside the sentence.

export function VariantSentence(props: FilterVariantProps): React.JSX.Element {
  const {
    filters,
    exerciseOptions,
    matchCount,
    active,
    onExercise,
    onToggleType,
    onSetTypes,
    onClear,
    onView,
  } = props;
  const noType = filters.trainingTypes.length === 0;
  return (
    <>
      <div className="flex flex-col gap-3 border-l-2 border-cyan pl-4">
        <p className="font-sans text-lg leading-loose text-text-secondary">
          <span className="font-display text-2xl text-text-primary">
            {matchCount}
          </span>{" "}
          sessions of{" "}
          <SentenceToggle on={noType} onClick={() => onSetTypes([])}>
            any type
          </SentenceToggle>
          <span className="text-text-muted"> / </span>
          {TRAINING_TYPES.map((type, i) => {
            const on = filters.trainingTypes.includes(type);
            return (
              <span key={type}>
                {i === 0 ? null : <span className="text-text-muted"> / </span>}
                <SentenceToggle on={on} onClick={() => onToggleType(type)}>
                  {type}
                </SentenceToggle>
              </span>
            );
          })}
          , with{" "}
          <span className="inline-block w-[13rem] max-w-full align-middle">
            <Select
              aria-label="Exercise"
              className="h-9 border-0 border-b border-cyan bg-transparent px-1 text-cyan"
              value={filters.exercise ?? ""}
              onChange={(event) => onExercise(event.target.value || null)}
            >
              <option value="">any exercise</option>
              {exerciseOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </span>
          , shown as a{" "}
          <SentenceToggle
            on={filters.view === "list"}
            onClick={() => onView("list")}
          >
            list
          </SentenceToggle>{" "}
          or a{" "}
          <SentenceToggle
            on={filters.view === "month"}
            onClick={() => onView("month")}
          >
            month
          </SentenceToggle>
          .
        </p>
        {active ? (
          <button
            type="button"
            onClick={onClear}
            className="label-mono self-start text-[11px] text-text-muted hover:text-cyan hover:underline"
          >
            ← Back to everything
          </button>
        ) : null}
      </div>
      {props.children}
    </>
  );
}

function SentenceToggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "rounded-sm px-1 capitalize decoration-2 underline-offset-4 transition-colors motion-reduce:transition-none",
        on
          ? "bg-cyan-dim text-cyan underline"
          : "text-text-muted hover:text-cyan",
      )}
    >
      {children}
    </button>
  );
}

// ── E · Facet rail ──────────────────────────────────────────────────────────────────────────
// A rail beside the results from `lg:`, a disclosure above them on a phone. Every option shows
// how many sessions it would leave, so the filter doubles as a read of what the record holds.

export function VariantFacetRail(props: FilterVariantProps): React.JSX.Element {
  const {
    index,
    filters,
    exerciseOptions,
    active,
    onExercise,
    onToggleType,
    onClear,
    onView,
  } = props;
  const { exerciseCounts, typeCounts } = useFacetCounts(index, filters);
  const [exerciseQuery, setExerciseQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [openOnPhone, setOpenOnPhone] = useState(false);

  const maxType = Math.max(1, ...typeCounts.values());
  const exercises = exerciseOptions
    .filter((name) =>
      name.toLowerCase().includes(exerciseQuery.trim().toLowerCase()),
    )
    .sort(
      (a, b) => (exerciseCounts.get(b) ?? 0) - (exerciseCounts.get(a) ?? 0),
    );
  const shownExercises =
    showAll || exerciseQuery !== "" ? exercises : exercises.slice(0, 6);
  const activeCount =
    filters.trainingTypes.length + (filters.exercise !== null ? 1 : 0);

  const rail = (
    <div className="flex flex-col gap-6">
      <HistoryViewToggle view={filters.view} onChange={onView} />

      <div className="flex flex-col gap-1">
        <span className="label-mono pb-1 text-[10px] text-text-muted">
          TRAINING TYPE
        </span>
        {TRAINING_TYPES.map((type) => {
          const on = filters.trainingTypes.includes(type);
          const count = typeCounts.get(type) ?? 0;
          return (
            <button
              key={type}
              type="button"
              aria-pressed={on}
              onClick={() => onToggleType(type)}
              className={cn(
                "relative flex items-center gap-2 overflow-hidden rounded-sm px-2 py-1.5 text-left font-sans text-sm capitalize transition-colors motion-reduce:transition-none",
                on
                  ? "bg-cyan-dim text-cyan"
                  : "text-text-secondary hover:text-cyan",
                count === 0 && !on && "text-text-muted",
              )}
            >
              <TypeDot type={type} />
              <span className="flex-1">{type}</span>
              <span className="font-mono text-xs">{count}</span>
              <span
                aria-hidden
                className={cn(
                  "absolute bottom-0 left-0 h-px",
                  trainingTypeFillClass(type),
                )}
                style={{ width: `${(count / maxType) * 100}%` }}
              />
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1">
        <span className="label-mono pb-1 text-[10px] text-text-muted">
          EXERCISE
        </span>
        <Input
          aria-label="Find an exercise"
          type="search"
          placeholder="Find…"
          className="mb-1 h-9"
          value={exerciseQuery}
          onChange={(event) => setExerciseQuery(event.target.value)}
        />
        {shownExercises.map((name) => {
          const on = filters.exercise === name;
          const count = exerciseCounts.get(name) ?? 0;
          return (
            <button
              key={name}
              type="button"
              aria-pressed={on}
              onClick={() => onExercise(on ? null : name)}
              className={cn(
                "flex items-center gap-2 rounded-sm px-2 py-1.5 text-left font-sans text-sm transition-colors motion-reduce:transition-none",
                on
                  ? "bg-cyan-dim text-cyan"
                  : "text-text-secondary hover:text-cyan",
                count === 0 && !on && "text-text-muted",
              )}
            >
              <span className="flex-1">{name}</span>
              <span className="font-mono text-xs">{count}</span>
            </button>
          );
        })}
        {exerciseQuery === "" && exercises.length > 6 ? (
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="label-mono self-start px-2 pt-1 text-[10px] text-text-muted hover:text-cyan"
          >
            {showAll ? "SHOW FEWER" : `SHOW ALL ${exercises.length}`}
          </button>
        ) : null}
      </div>

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
  );

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-8">
      {/* Phone: a disclosure carrying the active filters as tokens. */}
      <div className="flex flex-col gap-3 lg:hidden">
        <button
          type="button"
          aria-expanded={openOnPhone}
          onClick={() => setOpenOnPhone(!openOnPhone)}
          className="label-mono flex items-center justify-between rounded-sm border border-border px-4 py-3 text-[11px] text-text-secondary"
        >
          FILTERS{activeCount > 0 ? ` · ${activeCount}` : ""}
          <ChevronDown
            aria-hidden
            className={cn(
              "h-4 w-4 transition-transform motion-reduce:transition-none",
              openOnPhone && "rotate-180",
            )}
          />
        </button>
        {!openOnPhone && active ? (
          <div className="flex flex-wrap gap-1.5">
            {filters.trainingTypes.map((type) => (
              <Token
                key={type}
                label={type}
                dot={type}
                onRemove={() => onToggleType(type)}
              />
            ))}
            {filters.exercise !== null ? (
              <Token
                label={filters.exercise}
                onRemove={() => onExercise(null)}
              />
            ) : null}
          </div>
        ) : null}
        {openOnPhone ? <Card className="p-4">{rail}</Card> : null}
      </div>
      <aside className="hidden w-64 shrink-0 lg:sticky lg:top-4 lg:block">
        {rail}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col gap-6">{props.children}</div>
    </div>
  );
}
