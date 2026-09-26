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
import {
  catalogFiltersToParams,
  hasActiveFilters,
  toggleFacetValue,
} from "@/lib/exercise-browse-query";
import {
  PATTERN_BLURB,
  PATTERN_LABEL,
  parseMovementPattern,
} from "@/lib/movement-pattern";
import { equipmentLabel } from "@/lib/equipment";
import { createLatestCatalogRequest } from "@/lib/latest-catalog-request";
import {
  buildUsageMap,
  usageBadgeText,
  usageMarker,
  type UsageMarker,
} from "@/lib/exercise-usage-view";
import { useModalFocus } from "@/lib/use-modal-focus";
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

  // Re-fetch the whole grouped taxonomy whenever the filters change, and mirror those same
  // filters into the shareable URL alongside the fetch — so the URL and the on-screen results
  // always move together (a mid-typing refresh re-seeds and re-fetches from what the URL last
  // committed). The initial render is seeded from the server (URL → `initialFilters`), so the
  // first run is skipped. The URL is written with `history.replaceState` rather than a router
  // navigation, so this client keeps owning the re-fetch instead of re-running the Server
  // Component. Offline, don't fire a query that can only fail; reconnecting re-queries.
  const filtersKey = JSON.stringify(filters);
  const firstRun = useRef(true);
  const latestRequest = useRef(createLatestCatalogRequest());
  const updateFilters = (update: React.SetStateAction<CatalogFilters>) => {
    latestRequest.current.invalidate();
    setFilters(update);
  };
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const request = latestRequest.current.begin(filtersKey);
    const handle = setTimeout(() => {
      const search = catalogFiltersToParams(filters).toString();
      const url = search.length > 0 ? `?${search}` : window.location.pathname;
      window.history.replaceState(null, "", url);
      if (!online) return;
      startTransition(async () => {
        await request.run(
          () => fetchCatalogTaxonomyForFilters(filters),
          (result) => {
            setError(result.error);
            setTaxonomy(result.taxonomy);
          },
        );
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(handle);
      request.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, online]);

  const toggle = (
    field: "muscleGroups" | "equipment" | "difficulty",
    value: string,
  ) =>
    updateFilters((current) => ({
      ...current,
      [field]: toggleFacetValue(current[field], value),
    }));
  const clearFilters = () =>
    updateFilters({ query: "", muscleGroups: [], equipment: [], difficulty: [] });

  const active = hasActiveFilters(filters);

  // The Details drawer: which exercise is open, and its enter/exit animation state.
  const [selected, setSelected] = useState<ExerciseSearchResult | null>(null);
  const [drawerEntered, setDrawerEntered] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterFrame = useRef<number | null>(null);
  const clearDrawerTimers = () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    if (enterFrame.current !== null) cancelAnimationFrame(enterFrame.current);
  };
  useEffect(() => clearDrawerTimers, []);
  const openDetail = (exercise: ExerciseSearchResult) => {
    clearDrawerTimers();
    setSelected(exercise);
    enterFrame.current = requestAnimationFrame(() => setDrawerEntered(true));
  };
  const closeDetail = () => {
    clearDrawerTimers();
    setDrawerEntered(false);
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : DRAWER_ANIM_MS;
    closeTimer.current = setTimeout(() => setSelected(null), delay);
  };

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
              updateFilters((current) => ({ ...current, query: event.target.value }))
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
                  updateFilters((current) => ({
                    ...current,
                    equipment: [...myAvailable],
                  }))
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
              label={equipmentLabel(item)}
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
        <DetailDrawer entered={drawerEntered} onClose={closeDetail} label={selected.name}>
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
      <EquipmentSymbol equipment={exercise.equipment} />
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
  // The dialog's accessible name — the open exercise, so assistive tech announces which
  // entry the sheet is showing. Owned by the caller rather than tied to the detail heading,
  // so `CatalogDetail` stays a standalone, id-free component.
  label: string;
  children: React.ReactNode;
}

// The modal remains active through its exit transition, restoring focus on unmount.
function DetailDrawer({ entered, onClose, label, children }: DetailDrawerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  useModalFocus(dialogRef, true, onClose, surfaceRef);

  return (
    <div ref={surfaceRef} className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className={
          "absolute inset-0 bg-black/60 transition-opacity duration-300 motion-reduce:transition-none " +
          (entered ? "opacity-100" : "opacity-0")
        }
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={
          "relative z-10 max-h-[88dvh] w-full max-w-shell overflow-y-auto overscroll-contain scrollbar-thin rounded-t-2xl border border-border-lite bg-base px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl shadow-black/50 outline-none transition-transform duration-300 ease-out motion-reduce:transition-none " +
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
