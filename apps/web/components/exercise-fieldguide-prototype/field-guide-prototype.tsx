"use client";

// PROTOTYPE — Field Guide exercise discovery. Throwaway; see README.md.
//
// The container that hosts all three browse variants on the existing /exercises route.
// It owns the persistent chrome (search + facet filters — the layer that stays "intact
// behind" Details), the real read-only browse fetching (via the production
// `fetchCatalogPage` action), and the Details surface: a morphing dialog for variants
// A/B (the glyph flies from the row into the panel hero via the View Transitions API) and
// a bottom drawer for variant C. Nothing here mutates a plan.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Search, X } from "lucide-react";

import { fetchCatalogPage } from "@/app/exercises/actions";
import {
  DIFFICULTY_BANDS,
  MUSCLE_GROUPS,
  type CatalogFilters,
} from "@/lib/exercise-browse-types";
import { hasActiveFilters, toggleFacetValue } from "@/lib/exercise-browse-query";
import { useConnectivity } from "@/lib/use-connectivity";
import type { ExerciseSearchResult } from "@/lib/exercises-types";
import type { WeightUnit } from "@/lib/weight-unit";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OfflineNotice } from "@/components/pulse/offline-notice";

import { VariantAIndex } from "./variant-a-index";
import { VariantBSpecimens } from "./variant-b-specimens";
import { VariantCTaxonomy } from "./variant-c-taxonomy";
import { DetailContent } from "./detail-content";
import { PrototypeSwitcher } from "./prototype-switcher";
import { FIELD_GUIDE_VARIANTS } from "./variant-catalog";
import type { FieldGuideVariantProps } from "./variant-types";

const SEARCH_DEBOUNCE_MS = 300;
const DRAWER_ANIM_MS = 300;
const GLYPH_MORPH_NAME = "fg-hero";

interface FieldGuidePrototypeProps {
  variant: string;
  initialFilters: CatalogFilters;
  initialResults: ExerciseSearchResult[];
  initialTotal: number;
  equipmentOptions: string[];
  myEquipment: string[];
  unit: WeightUnit;
}

function supportsViewTransitions(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof (document as Document & { startViewTransition?: unknown })
      .startViewTransition === "function"
  );
}

export function FieldGuidePrototype(props: FieldGuidePrototypeProps): React.JSX.Element {
  const { variant, unit } = props;
  const surface: "dialog" | "drawer" = variant === "C" ? "drawer" : "dialog";

  // --- Browse state (mirrors the production browser, kept read-only) -------------------
  const [filters, setFilters] = useState<CatalogFilters>(props.initialFilters);
  const [results, setResults] = useState<ExerciseSearchResult[]>(props.initialResults);
  const [total, setTotal] = useState(props.initialTotal);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const online = useConnectivity();

  const myAvailable = useMemo(
    () => props.myEquipment.filter((item) => props.equipmentOptions.includes(item)),
    [props.myEquipment, props.equipmentOptions],
  );

  const filtersKey = JSON.stringify(filters);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (!online) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      const page = await fetchCatalogPage(filters, 0);
      setError(page.error);
      setResults(page.results);
      setTotal(page.total);
      setLoading(false);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, online]);

  const loadMore = async () => {
    if (!online) return;
    setLoading(true);
    const page = await fetchCatalogPage(filters, results.length);
    if (page.error) {
      setError(page.error);
    } else {
      setError(null);
      setResults((current) => [...current, ...page.results]);
      setTotal(page.total);
    }
    setLoading(false);
  };

  const toggle = (field: "muscleGroups" | "equipment" | "difficulty", value: string) =>
    setFilters((current) => ({
      ...current,
      [field]: toggleFacetValue(current[field], value),
    }));
  const clearFilters = () =>
    setFilters({ query: "", muscleGroups: [], equipment: [], difficulty: [] });
  const active = hasActiveFilters(filters);
  const canLoadMore = results.length < total;

  // --- Details surface state -----------------------------------------------------------
  const [selected, setSelected] = useState<ExerciseSearchResult | null>(null);
  const [morphId, setMorphId] = useState<number | null>(null);
  const [drawerEntered, setDrawerEntered] = useState(false);

  const openDetail = useCallback(
    (exercise: ExerciseSearchResult) => {
      if (surface === "drawer") {
        setSelected(exercise);
        requestAnimationFrame(() => setDrawerEntered(true));
        return;
      }
      // Dialog: morph the glyph from the row into the panel hero. Set the morph id first
      // (so the OLD snapshot has the row's glyph named), then mount the dialog inside the
      // view transition (the NEW snapshot has the hero named), so the browser tweens
      // between them. flushSync forces the DOM commit inside the transition callback.
      flushSync(() => setMorphId(exercise.id));
      const mount = () => flushSync(() => setSelected(exercise));
      if (supportsViewTransitions()) {
        (document as Document & {
          startViewTransition: (cb: () => void) => void;
        }).startViewTransition(mount);
      } else {
        mount();
      }
    },
    [surface],
  );

  const closeDetail = useCallback(() => {
    if (surface === "drawer") {
      setDrawerEntered(false);
      setTimeout(() => setSelected(null), DRAWER_ANIM_MS);
      return;
    }
    const unmount = () => flushSync(() => setSelected(null));
    if (supportsViewTransitions()) {
      const transition = (document as Document & {
        startViewTransition: (cb: () => void) => { finished: Promise<void> };
      }).startViewTransition(unmount);
      transition.finished.finally(() => setMorphId(null));
    } else {
      unmount();
      setMorphId(null);
    }
  }, [surface]);

  // Escape closes whichever surface is open.
  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDetail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, closeDetail]);

  // The row glyph carries the morph name only while no dialog is mounted (so exactly one
  // element ever owns the name — a duplicate would abort the transition).
  const resolveGlyphName = useCallback(
    (exerciseId: number): string | undefined =>
      surface === "dialog" && morphId === exerciseId && selected === null
        ? GLYPH_MORPH_NAME
        : undefined,
    [surface, morphId, selected],
  );

  const variantProps: FieldGuideVariantProps = { results, onOpen: openDetail, resolveGlyphName };

  return (
    <div className="flex flex-col gap-5">
      {!online ? (
        <OfflineNotice>
          Searching the catalog needs a connection — reconnect to search.
        </OfflineNotice>
      ) : null}

      {/* Persistent chrome — search + filters stay put behind the Details surface. */}
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

      <FacetRow label="MOVEMENT">
        {MUSCLE_GROUPS.map((group) => (
          <Chip
            key={group}
            label={group}
            active={filters.muscleGroups.includes(group)}
            disabled={!online}
            onClick={() => toggle("muscleGroups", group)}
          />
        ))}
      </FacetRow>
      <FacetRow label="DIFFICULTY">
        {DIFFICULTY_BANDS.map((band) => (
          <Chip
            key={band.value}
            label={band.label}
            active={filters.difficulty.includes(band.value)}
            disabled={!online}
            onClick={() => toggle("difficulty", band.value)}
          />
        ))}
      </FacetRow>
      {props.equipmentOptions.length > 0 ? (
        <FacetRow
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
          {props.equipmentOptions.map((item) => (
            <Chip
              key={item}
              label={item}
              active={filters.equipment.includes(item)}
              disabled={!online}
              onClick={() => toggle("equipment", item)}
            />
          ))}
        </FacetRow>
      ) : null}

      <div className="flex items-center justify-between">
        <span className="label-mono text-[10px] text-text-muted">
          {loading ? "SEARCHING…" : `${total} EXERCISE${total === 1 ? "" : "S"}`}
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

      {results.length === 0 && !loading && !error ? (
        <p className="rounded-md border border-dashed border-border bg-surface p-6 text-center font-sans text-[13px] text-text-secondary">
          No exercises match these filters.
        </p>
      ) : null}

      {/* The active variant's results region. */}
      {results.length > 0 ? (
        variant === "B" ? (
          <VariantBSpecimens {...variantProps} />
        ) : variant === "C" ? (
          <VariantCTaxonomy {...variantProps} />
        ) : (
          <VariantAIndex {...variantProps} />
        )
      ) : null}

      {canLoadMore ? (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={loadMore}
          disabled={loading || !online}
        >
          {loading ? "Loading…" : `Load more (${total - results.length} more)`}
        </Button>
      ) : null}

      {/* Details surface. */}
      {selected && surface === "dialog" ? (
        <DetailDialog onClose={closeDetail}>
          <DetailContent
            exercise={selected}
            unit={unit}
            glyphViewTransitionName={GLYPH_MORPH_NAME}
          />
        </DetailDialog>
      ) : null}
      {selected && surface === "drawer" ? (
        <DetailDrawer entered={drawerEntered} onClose={closeDetail}>
          <DetailContent exercise={selected} unit={unit} />
        </DetailDrawer>
      ) : null}

      <PrototypeSwitcher variants={FIELD_GUIDE_VARIANTS} current={variant} />
    </div>
  );
}

// --- Chrome bits (inlined; prototype tolerates the small duplication) ------------------

function FacetRow({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
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

function Chip({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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

// --- Detail surfaces -------------------------------------------------------------------

// Morphing dialog (variants A/B): a centred panel over a scrim. The shared-element morph
// (the glyph flying from the row) is driven by the View Transitions API in the container;
// this is just the panel chrome. Study reference: Motion Primitives' Morphing Dialog.
function DetailDialog({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 max-h-[85vh] w-full max-w-shell overflow-y-auto scrollbar-thin rounded-xl border border-border-lite bg-base p-5 shadow-2xl shadow-black/50"
      >
        <CloseButton onClose={onClose} />
        {children}
      </div>
    </div>
  );
}

// Bottom drawer (variant C): a mobile-first sheet that slides up from the bottom edge,
// with a grab handle. Study reference: shadcn/ui Drawer.
function DetailDrawer({
  entered,
  onClose,
  children,
}: {
  entered: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
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
        <CloseButton onClose={onClose} />
        {children}
      </div>
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close details"
      className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-elevated hover:text-text-primary"
    >
      <X className="h-4 w-4" />
    </button>
  );
}
