"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronRight, Search } from "lucide-react";

import { fetchCatalogPage } from "@/app/exercises/actions";
import {
  CATALOG_PAGE_SIZE,
  DIFFICULTY_BANDS,
  MUSCLE_GROUPS,
  type CatalogFilters,
  type ExerciseUsage,
} from "@/lib/exercise-browse-types";
import {
  hasActiveFilters,
  toggleFacetValue,
} from "@/lib/exercise-browse-query";
import { buildUsageMap, usageMarker } from "@/lib/exercise-usage-view";
import { formatMuscleSummary } from "@/lib/exercise-muscle-summary";
import { useConnectivity } from "@/lib/use-connectivity";
import type { ExerciseSearchResult } from "@/lib/exercises-types";
import { OfflineNotice } from "@/components/pulse/offline-notice";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CompletenessBadge } from "@/components/exercise/completeness-badge";

interface ExerciseCatalogBrowserProps {
  initialFilters: CatalogFilters;
  initialResults: ExerciseSearchResult[];
  initialTotal: number;
  // The Catalog's distinct equipment labels (the equipment facet's options).
  equipmentOptions: string[];
  // The user's Default Equipment — the one-tap "my equipment" shortcut, never a default
  // filter (ADR-0042). Empty when unknown or unset.
  myEquipment: string[];
  usage: ExerciseUsage[];
  // Today, as a date-only ISO string, so the descriptive recency reads relative to now.
  referenceIso: string;
}

// How long to wait after the last keystroke before re-querying, so typing a name does not
// fire a request per character — the same debounce ethos as the Exercise Library picker.
const SEARCH_DEBOUNCE_MS = 300;

// The Browse-the-Catalog surface (ADR-0042): the whole shared Catalog, faceted by Muscle
// Group / equipment / difficulty with a name search, each row carrying its Provenance and
// Completeness badges and a strictly descriptive TRAINED / NEW usage marker. Read-only —
// a row links out to Exercise Detail; nothing here edits a plan.
export function ExerciseCatalogBrowser({
  initialFilters,
  initialResults,
  initialTotal,
  equipmentOptions,
  myEquipment,
  usage,
  referenceIso,
}: ExerciseCatalogBrowserProps): React.JSX.Element {
  const [filters, setFilters] = useState<CatalogFilters>(initialFilters);
  const [results, setResults] = useState<ExerciseSearchResult[]>(initialResults);
  const [total, setTotal] = useState(initialTotal);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loadingMore, startLoadMore] = useTransition();
  // Catalog search hits the server on every query and "load more". While offline, annotate
  // and disable it rather than fire requests that can only fail (issue #414); reconnecting
  // re-queries the current filters (below).
  const online = useConnectivity();

  const usageMap = useMemo(() => buildUsageMap(usage), [usage]);
  // Equipment options the user actually owns, offered as a one-tap shortcut; only those
  // present in the Catalog are actionable as filters.
  const myAvailable = useMemo(
    () => myEquipment.filter((item) => equipmentOptions.includes(item)),
    [myEquipment, equipmentOptions],
  );

  // Re-query page one whenever the filters change. The initial render is seeded from the
  // server, so the first run is skipped to avoid a redundant fetch.
  const filtersKey = JSON.stringify(filters);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    // Offline: don't fire a query that can only fail. Re-running when `online` flips back to
    // true re-queries page one for the current filters, so results catch up on reconnect.
    if (!online) return;
    const handle = setTimeout(() => {
      startTransition(async () => {
        const page = await fetchCatalogPage(filters, 0);
        setError(page.error);
        setResults(page.results);
        setTotal(page.total);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // filtersKey captures every field of `filters`; `filters` is read inside. `online`
    // gates firing and re-queries on reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, online]);

  const loadMore = () => {
    if (!online) return;
    startLoadMore(async () => {
      const page = await fetchCatalogPage(filters, results.length);
      if (page.error) {
        setError(page.error);
        return;
      }
      setError(null);
      setResults((current) => [...current, ...page.results]);
      setTotal(page.total);
    });
  };

  const toggleMuscle = (group: string) =>
    setFilters((current) => ({
      ...current,
      muscleGroups: toggleFacetValue(current.muscleGroups, group),
    }));
  const toggleEquipment = (item: string) =>
    setFilters((current) => ({
      ...current,
      equipment: toggleFacetValue(current.equipment, item),
    }));
  const toggleDifficulty = (band: string) =>
    setFilters((current) => ({
      ...current,
      difficulty: toggleFacetValue(current.difficulty, band),
    }));
  const useMyEquipment = () =>
    setFilters((current) => ({ ...current, equipment: [...myAvailable] }));
  const clearFilters = () =>
    setFilters({ query: "", muscleGroups: [], equipment: [], difficulty: [] });

  const active = hasActiveFilters(filters);
  const canLoadMore = results.length < total;

  return (
    <div className="flex flex-col gap-5">
      {!online ? (
        <OfflineNotice>
          Searching the Catalog needs a connection — reconnect to search.
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
            placeholder="Search a movement…"
            aria-label="Search the Exercise Catalog"
            className="pl-9"
            disabled={!online}
            onChange={(e) =>
              setFilters((current) => ({ ...current, query: e.target.value }))
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
            onToggle={() => toggleMuscle(group)}
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
            onToggle={() => toggleDifficulty(band.value)}
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
                onClick={useMyEquipment}
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
              onToggle={() => toggleEquipment(item)}
            />
          ))}
        </FacetGroup>
      ) : null}

      <div className="flex items-center justify-between">
        <span className="label-mono text-[10px] text-text-muted">
          {pending ? "SEARCHING…" : `${total} MOVEMENT${total === 1 ? "" : "S"}`}
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

      {error ? (
        <p className="label-mono text-[10px] text-magenta">{error}</p>
      ) : null}

      {!pending && results.length === 0 && !error ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border bg-surface p-6 text-center">
          <p className="font-sans text-[13px] text-text-secondary">
            No movements match these filters.
          </p>
          {active ? (
            <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : null}

      {results.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {results.map((exercise) => (
            <li key={exercise.id}>
              <CatalogRow
                exercise={exercise}
                lastPerformedOn={usageMap.get(exercise.id) ?? null}
                referenceIso={referenceIso}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {canLoadMore ? (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={loadMore}
          disabled={loadingMore || !online}
        >
          {loadingMore ? "Loading…" : `Load more (${total - results.length} more)`}
        </Button>
      ) : null}
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

interface CatalogRowProps {
  exercise: ExerciseSearchResult;
  lastPerformedOn: string | null;
  referenceIso: string;
}

function CatalogRow({ exercise, lastPerformedOn, referenceIso }: CatalogRowProps) {
  const marker = usageMarker(lastPerformedOn, referenceIso);
  return (
    <Link
      href={`/exercises/${exercise.id}?from=${encodeURIComponent("/exercises")}`}
      className="flex items-center gap-3 rounded-sm border border-border bg-base p-3 hover:border-text-muted"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-sans text-[14px] text-text-primary">
            {exercise.name}
          </span>
          <ProvenanceBadge provenance={exercise.provenance} />
          <CompletenessBadge completeness={exercise.completeness} />
          <UsageBadge trained={marker.trained} label={marker.label} />
        </div>
        {exercise.targeted_muscles.length > 0 ? (
          <span className="truncate label-mono text-[9px] text-text-muted">
            {formatMuscleSummary(exercise.targeted_muscles)}
          </span>
        ) : null}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
    </Link>
  );
}

// Provenance surfaced exactly as the Exercise Library and Exercise Detail do.
function ProvenanceBadge({ provenance }: { provenance: string }) {
  return provenance === "ai_generated" ? (
    <Badge variant="magenta" title="AI-generated, not yet reviewed">
      AI-GEN
    </Badge>
  ) : (
    <Badge variant="cyan">CURATED</Badge>
  );
}

// The strictly descriptive usage marker (ADR-0042): NEW when never trained, else a neutral
// "last …" recency. No call to action, no "overdue" styling.
function UsageBadge({ trained, label }: { trained: boolean; label: string }) {
  if (!trained) {
    return <Badge variant="outline">NEW</Badge>;
  }
  return (
    <span className="label-mono text-[9px] text-text-muted">TRAINED · last {label}</span>
  );
}
