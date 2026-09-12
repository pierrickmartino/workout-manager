"use client";

// The inner content of the field-guide Details drawer (ADR-0072). Given the taxonomy row
// it already has (name, pattern, muscles, equipment) it paints the field-guide header
// instantly, then lazily loads the honest detail — how-to, alternatives, past performance —
// via the read-only `fetchCatalogEntryDetail` action. Read-only: alternatives deep-link to
// the full Exercise Detail page; nothing here edits a plan.

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, TrendingUp } from "lucide-react";

import {
  fetchCatalogEntryDetail,
  type CatalogEntryDetail,
} from "@/app/exercises/catalog-detail-action";
import {
  PATTERN_BLURB,
  PATTERN_LABEL,
  parseMovementPattern,
} from "@/lib/movement-pattern";
import { plainMuscleSummary } from "@/lib/plain-muscle-summary";
import { toStatTiles } from "@/lib/exercise-stats-view";
import type { WeightUnit } from "@/lib/weight-unit";
import type { ExerciseSearchResult } from "@/lib/exercises-types";
import { MovementGlyph } from "./movement-glyph";
import { EquipmentSymbol } from "./equipment-symbol";

interface CatalogDetailProps {
  exercise: ExerciseSearchResult;
  unit: WeightUnit;
}

export function CatalogDetail({ exercise, unit }: CatalogDetailProps): React.JSX.Element {
  const [detail, setDetail] = useState<CatalogEntryDetail | null>(null);

  // Load the honest detail when the drawer opens for this exercise. A changed id (the user
  // tapped another row while one was open) re-fetches.
  useEffect(() => {
    let live = true;
    setDetail(null);
    fetchCatalogEntryDetail(exercise.id).then((result) => {
      if (live) setDetail(result);
    });
    return () => {
      live = false;
    };
  }, [exercise.id]);

  const pattern = parseMovementPattern(exercise.movement_pattern);
  const summary = plainMuscleSummary(exercise.targeted_muscles);

  return (
    <div className="flex flex-col gap-6">
      {/* Field-guide header — painted instantly from what the row already knows. */}
      <div className="flex items-start gap-4">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-border bg-elevated text-text-primary">
          <MovementGlyph pattern={pattern} className="h-11 w-11" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h2 className="font-display text-xl font-semibold leading-tight text-text-primary">
            {exercise.name}
          </h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="label-mono text-[10px] text-cyan">
              {PATTERN_LABEL[pattern]}
            </span>
            <EquipmentSymbol equipment={exercise.required_equipment} showOverflowCount />
          </div>
          {summary ? (
            <p className="font-sans text-[13px] leading-relaxed text-text-secondary">
              {summary}
            </p>
          ) : null}
        </div>
      </div>

      <p className="rounded-md border border-dashed border-border bg-surface px-3.5 py-2.5 font-sans text-[12px] leading-relaxed text-text-muted">
        {PATTERN_BLURB[pattern]}
      </p>

      {detail === null ? (
        <LoadingRows />
      ) : detail.error ? (
        <p className="label-mono text-[11px] text-magenta">{detail.error}</p>
      ) : (
        <LoadedDetail detail={detail} unit={unit} />
      )}
    </div>
  );
}

function LoadedDetail({
  detail,
  unit,
}: {
  detail: CatalogEntryDetail;
  unit: WeightUnit;
}) {
  const { exercise, records } = detail;
  if (!exercise) return null;

  const tiles = records ? toStatTiles(records, unit) : [];

  return (
    <div className="flex flex-col gap-6">
      <PastPerformance
        tiles={tiles}
        hasSeries={(records?.top_set_series.length ?? 0) > 0}
      />
      <HowTo steps={exercise.instructions} />
      <Alternatives items={exercise.alternatives} />
    </div>
  );
}

// PAST PERFORMANCE — the record-side figures the field guide surfaces without leaving the
// drawer. Honest empties: a never-logged movement shows the "not trained yet" line rather
// than fabricated zeros (ADR-0017).
function PastPerformance({
  tiles,
  hasSeries,
}: {
  tiles: { label: string; value: string }[];
  hasSeries: boolean;
}) {
  const trained = tiles.some(
    (tile) => tile.label === "TOTAL SETS" && tile.value !== "0",
  );
  return (
    <section className="flex flex-col gap-2.5">
      <SectionLabel icon={<TrendingUp className="h-3.5 w-3.5" aria-hidden />}>
        Past performance
      </SectionLabel>
      {trained ? (
        <div className="grid grid-cols-2 gap-2">
          {tiles.map((tile) => (
            <div
              key={tile.label}
              className="flex flex-col gap-1 rounded-md border border-border bg-surface p-3"
            >
              <span className="label-mono text-[9px] text-text-muted">{tile.label}</span>
              <span className="font-display text-lg font-semibold text-text-primary">
                {tile.value}
              </span>
            </div>
          ))}
          {hasSeries ? (
            <div className="col-span-2 flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2">
              <TrendingUp className="h-3.5 w-3.5 text-cyan" aria-hidden />
              <span className="font-sans text-[12px] text-text-secondary">
                A top-set trend is building — see the full chart on Details.
              </span>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="font-sans text-[13px] text-text-muted">
          You haven&apos;t logged this movement yet — it&apos;ll start tracking once you do.
        </p>
      )}
    </section>
  );
}

// HOW TO PERFORM — the authored Execution Steps, numbered when there are several.
function HowTo({ steps }: { steps: string[] }) {
  if (steps.length === 0) return null;
  return (
    <section className="flex flex-col gap-2.5">
      <SectionLabel>How to perform</SectionLabel>
      <ol className="flex flex-col gap-2.5">
        {steps.map((step, index) => (
          <li key={step} className="flex items-start gap-3">
            {steps.length > 1 ? (
              <span className="label-mono mt-0.5 shrink-0 text-[11px] text-magenta">
                {String(index + 1).padStart(2, "0")}
              </span>
            ) : null}
            <span className="font-sans text-[13px] leading-relaxed text-text-secondary">
              {step}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ALTERNATIVES — sibling movements the user can swap toward, each linking to full Detail.
function Alternatives({ items }: { items: { id: number; name: string }[] }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2.5">
      <SectionLabel>Alternatives</SectionLabel>
      <div className="overflow-hidden rounded-md border border-border">
        {items.map((item, index) => (
          <Link
            key={item.id}
            href={`/exercises/${item.id}?from=${encodeURIComponent("/exercises")}`}
            className={
              "group flex items-center justify-between gap-3 px-3.5 py-3 transition-colors hover:bg-elevated/60 " +
              (index > 0 ? "border-t border-border" : "")
            }
          >
            <span className="font-sans text-[13px] text-text-primary">{item.name}</span>
            <ChevronRight className="h-4 w-4 text-text-muted transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function SectionLabel({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 text-text-muted">
      {icon}
      <span className="label-mono text-[10px]">{children}</span>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {[0, 1, 2].map((row) => (
        <div key={row} className="h-4 w-full animate-pulse rounded bg-elevated" />
      ))}
      <div className="h-4 w-2/3 animate-pulse rounded bg-elevated" />
    </div>
  );
}
