"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronRight,
  Search,
  X,
} from "lucide-react";

import { fetchCatalogTaxonomyForFilters } from "@/app/exercises/actions";
import {
  DIFFICULTY_BANDS,
  MUSCLE_GROUPS,
  type CatalogFilters,
  type ExerciseUsage,
} from "@/lib/exercise-browse-types";
import type { CatalogTaxonomy } from "@/lib/exercise-taxonomy-types";
import { hasActiveFilters, toggleFacetValue } from "@/lib/exercise-browse-query";
import {
  PATTERN_BLURB,
  PATTERN_LABEL,
  parseMovementPattern,
} from "@/lib/movement-pattern";
import {
  buildUsageMap,
  usageBadgeText,
  usageMarker,
  type UsageMarker,
} from "@/lib/exercise-usage-view";
import { useConnectivity } from "@/lib/use-connectivity";
import type { ExerciseSearchResult } from "@/lib/exercises-types";
import type { WeightUnit } from "@/lib/weight-unit";
import { OfflineNotice } from "@/components/pulse/offline-notice";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MovementGlyph } from "@/components/exercise/movement-glyph";
import { EquipmentSymbol } from "@/components/exercise/equipment-symbol";
import { CatalogDetail } from "@/components/exercise/catalog-detail";

interface ExerciseCatalogTaxonomyProps {
  initialFilters: CatalogFilters;
  initialTaxonomy: CatalogTaxonomy;
  equipmentOptions: string[];
  myEquipment: string[];
  usage: ExerciseUsage[];
  referenceIso: string;
  unit: WeightUnit;
}

const SEARCH_DEBOUNCE_MS = 300;
const DRAWER_ANIM_MS = 300;

// Browse the Catalog as a field-guide Movement Pattern taxonomy (ADR-0072): the whole
// filtered Catalog, grouped server-side into collapsible pattern sections, each entry
// carrying its line illustration, plain-language muscle summary, and equipment symbol.
// Opening an entry reveals its how-to, alternatives, and past performance in a bottom
// drawer while the search and selected filters stay intact behind it. Read-only — a row
// never edits a plan.
export function ExerciseCatalogTaxonomy({
  initialFilters,
  initialTaxonomy,
  equipmentOptions,
  myEquipment,
  usage,
  referenceIso,
  unit,
}: ExerciseCatalogTaxonomyProps): React.JSX.Element {
  const [filters, setFilters] = useState<CatalogFilters>(initialFilters);
  const [taxonomy, setTaxonomy] = useState<CatalogTaxonomy>(initialTaxonomy);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const online = useConnectivity();

  const usageMap = useMemo(() => buildUsageMap(usage), [usage]);
  const myAvailable = useMemo(
    () => myEquipment.filter((item) => equipmentOptions.includes(item)),
    [myEquipment, equipmentOptions],
  );

  // Re-fetch the whole grouped taxonomy whenever the filters change. The initial render is
  // seeded from the server, so the first run is skipped. Offline, don't fire a query that
  // can only fail; reconnecting re-queries the current filters.
  const filtersKey = JSON.stringify(filters);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (!online) return;
    const handle = setTimeout(() => {
      startTransition(async () => {
        const result = await fetchCatalogTaxonomyForFilters(filters);
        setError(result.error);
        setTaxonomy(result.taxonomy);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, online]);

  const toggle = (
    field: "muscleGroups" | "equipment" | "difficulty",
    value: string,
  ) =>
    setFilters((current) => ({
      ...current,
      [field]: toggleFacetValue(current[field], value),
    }));
  const clearFilters = () =>
    setFilters({ query: "", muscleGroups: [], equipment: [], difficulty: [] });

  const active = hasActiveFilters(filters);

  // The Details drawer: which exercise is open, and its enter/exit animation state.
  const [selected, setSelected] = useState<ExerciseSearchResult | null>(null);
  const [drawerEntered, setDrawerEntered] = useState(false);

  const openDetail = (exercise: ExerciseSearchResult) => {
    setSelected(exercise);
    requestAnimationFrame(() => setDrawerEntered(true));
  };
  const closeDetail = () => {
    setDrawerEntered(false);
    setTimeout(() => setSelected(null), DRAWER_ANIM_MS);
  };

  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDetail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return (
    <div className="flex flex-col gap-5">
      {!online ? (
        <OfflineNotice>
          Searching the catalog needs a connection — reconnect to search.
        </OfflineNotice>
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className="label-mono text-[9px] text-text-muted">SEARCH THE CATALOG</span>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            aria-hidden
          />
          <Input
            value={filters.query}
            placeholder="Search an exercise…"
            aria-label="Search the exercise catalog"
            className="pl-9"
            disabled={!online}
            onChange={(event) =>
              setFilters((current) => ({ ...current, query: event.target.value }))
            }
          />
        </div>
      </label>

      <FacetGroup label="MUSCLE GROUP">
        {MUSCLE_GROUPS.map((group) => (
          <FacetChip
            key={group}
            label={group}
            active={filters.muscleGroups.includes(group)}
            disabled={!online}
            onToggle={() => toggle("muscleGroups", group)}
          />
        ))}
      </FacetGroup>

      <FacetGroup label="DIFFICULTY">
        {DIFFICULTY_BANDS.map((band) => (
          <FacetChip
            key={band.value}
            label={band.label}
            active={filters.difficulty.includes(band.value)}
            disabled={!online}
            onToggle={() => toggle("difficulty", band.value)}
          />
        ))}
      </FacetGroup>

      {equipmentOptions.length > 0 ? (
        <FacetGroup
          label="EQUIPMENT"
          action={
            myAvailable.length > 0 ? (
              <button
                type="button"
                onClick={() =>
                  setFilters((current) => ({ ...current, equipment: [...myAvailable] }))
                }
                className="label-mono text-[9px] text-cyan hover:underline"
              >
                MY EQUIPMENT
              </button>
            ) : null
          }
        >
          {equipmentOptions.map((item) => (
            <FacetChip
              key={item}
              label={item}
              active={filters.equipment.includes(item)}
              disabled={!online}
              onToggle={() => toggle("equipment", item)}
            />
          ))}
        </FacetGroup>
      ) : null}

      <div className="flex items-center justify-between">
        <span className="label-mono text-[10px] text-text-muted">
          {pending
            ? "SEARCHING…"
            : `${taxonomy.total} EXERCISE${taxonomy.total === 1 ? "" : "S"}`}
        </span>
        {active ? (
          <button
            type="button"
            onClick={clearFilters}
            className="label-mono text-[10px] text-cyan hover:underline"
          >
            CLEAR FILTERS
          </button>
        ) : null}
      </div>

      {error ? <p className="label-mono text-[10px] text-magenta">{error}</p> : null}

      {!pending && taxonomy.groups.length === 0 && !error ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border bg-surface p-6 text-center">
          <p className="font-sans text-[13px] text-text-secondary">
            No exercises match these filters.
          </p>
          {active ? (
            <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {taxonomy.groups.map((group) => (
          <PatternSection
            key={group.pattern}
            pattern={group.pattern}
            count={group.count}
            exercises={group.exercises}
            usageMap={usageMap}
            referenceIso={referenceIso}
            onOpen={openDetail}
          />
        ))}
      </div>

      {selected ? (
        <DetailDrawer entered={drawerEntered} onClose={closeDetail}>
          <CatalogDetail exercise={selected} unit={unit} />
        </DetailDrawer>
      ) : null}
    </div>
  );
}

interface PatternSectionProps {
  pattern: string;
  count: number;
  exercises: ExerciseSearchResult[];
  usageMap: Map<number, string>;
  referenceIso: string;
  onOpen: (exercise: ExerciseSearchResult) => void;
}

// One collapsible Movement Pattern section: its family plate, label, count, and blurb over
// a list of the exercises that classify into it. Starts open so the whole catalog is
// scannable; the header toggles it shut.
function PatternSection({
  pattern,
  count,
  exercises,
  usageMap,
  referenceIso,
  onOpen,
}: PatternSectionProps) {
  const [open, setOpen] = useState(true);
  const resolved = parseMovementPattern(pattern);

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-elevated/50"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-base text-cyan">
          <MovementGlyph pattern={resolved} className="h-7 w-7" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2">
            <span className="font-display text-[15px] font-semibold text-text-primary">
              {PATTERN_LABEL[resolved]}
            </span>
            <span className="label-mono text-[9px] text-text-muted">{count}</span>
          </span>
          <span className="truncate font-sans text-[11px] text-text-muted">
            {PATTERN_BLURB[resolved]}
          </span>
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
        )}
      </button>

      {open ? (
        <ul className="border-t border-border">
          {exercises.map((exercise) => (
            <li key={exercise.id}>
              <TaxonomyRow
                exercise={exercise}
                lastPerformedOn={usageMap.get(exercise.id) ?? null}
                referenceIso={referenceIso}
                onOpen={onOpen}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

interface TaxonomyRowProps {
  exercise: ExerciseSearchResult;
  lastPerformedOn: string | null;
  referenceIso: string;
  onOpen: (exercise: ExerciseSearchResult) => void;
}

function TaxonomyRow({
  exercise,
  lastPerformedOn,
  referenceIso,
  onOpen,
}: TaxonomyRowProps) {
  const pattern = parseMovementPattern(exercise.movement_pattern);
  const marker = usageMarker(lastPerformedOn, referenceIso);

  return (
    <button
      type="button"
      onClick={() => onOpen(exercise)}
      className="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-elevated/40"
    >
      <MovementGlyph
        pattern={pattern}
        className="h-5 w-5 shrink-0 text-text-muted"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="truncate font-sans text-[13px] text-text-primary">
            {exercise.name}
          </span>
          <UsageBadge marker={marker} />
        </span>
      </span>
      <EquipmentSymbol equipment={exercise.required_equipment} />
      <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
    </button>
  );
}

// The strictly descriptive usage marker (ADR-0042): NEW when never trained, else a neutral
// "TRAINED · <recency>". Preserved from the flat browse so the redesign loses none of its
// signal. No call to action, no "overdue" styling.
function UsageBadge({ marker }: { marker: UsageMarker }) {
  const text = usageBadgeText(marker);
  if (!marker.trained) {
    return <Badge variant="outline">{text}</Badge>;
  }
  return <span className="label-mono text-[9px] text-text-muted">{text}</span>;
}

interface DetailDrawerProps {
  entered: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

// The bottom Drawer detail surface: a mobile-first sheet that slides up from the bottom
// edge over a scrim, with a grab handle. The search and filters stay mounted behind it.
function DetailDrawer({ entered, onClose, children }: DetailDrawerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className={
          "absolute inset-0 bg-black/60 transition-opacity duration-300 " +
          (entered ? "opacity-100" : "opacity-0")
        }
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={
          "relative z-10 max-h-[88vh] w-full max-w-shell overflow-y-auto scrollbar-thin rounded-t-2xl border border-border-lite bg-base px-5 pb-8 pt-3 shadow-2xl shadow-black/50 transition-transform duration-300 ease-out " +
          (entered ? "translate-y-0" : "translate-y-full")
        }
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border-lite" aria-hidden />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-elevated hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

interface FacetGroupProps {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

function FacetGroup({ label, action, children }: FacetGroupProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="label-mono text-[9px] text-text-muted">{label}</span>
        {action}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

interface FacetChipProps {
  label: string;
  active: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

function FacetChip({ label, active, disabled = false, onToggle }: FacetChipProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={active}
      className={
        "rounded-full border px-3 py-1 font-sans text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
        (active
          ? "border-cyan bg-cyan/10 text-cyan"
          : "border-border bg-surface text-text-secondary hover:border-text-muted")
      }
    >
      {label}
    </button>
  );
}
