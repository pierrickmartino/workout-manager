// PROTOTYPE — throwaway. The three structurally-different takes on the Muscle Atlas the switcher
// flips between. All read the same mock coverage; only the rendering/layout/affordance changes.
//
//   A — Baseline: the shipped sparse-blob atlas, for direct before/after comparison.
//   B — Sasha-style anatomical, front + back side by side, tap-to-open detail card below.
//   C — Same anatomical artwork, ONE large figure with a front/back toggle and a persistent
//       legend + detail rail beside it (different hierarchy and primary affordance).

"use client";

import { useState } from "react";

import type { MuscleRegion } from "@/lib/muscle-region-atlas-view";
import type { View } from "@/lib/atlas/atlas-geometry";
import { AtlasFigure } from "@/components/analytics/atlas-figure";
import { groupColorVar } from "@/components/pulse/muscle-colors";
import { cn } from "@/lib/utils";
import { RedesignFigure } from "./redesign-figure";
import { REDESIGN_MUSCLES } from "./redesign-spec";
import { MOCK_REGIONS } from "./mock-data";

const GROUP_ORDER = ["Legs", "Chest", "Back", "Shoulders", "Arms", "Core"];

interface VariantProps {
  selected: string | null;
  onSelect: (muscle: string) => void;
}

// ------------------------------------------------------------------ shared detail card
function MuscleDetail({ region }: { region: MuscleRegion | null }) {
  if (!region) {
    return (
      <p className="font-sans text-sm text-text-muted">
        Tap a muscle to see its recent volume and the exercises behind it.
      </p>
    );
  }
  const color = groupColorVar(region.group);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="h-3 w-3 shrink-0 rounded-[3px]"
          style={{ background: region.covered ? color : "transparent", border: `1px solid ${color}` }}
        />
        <div className="min-w-0">
          <p className="font-sans text-[15px] font-semibold text-text-primary">{region.muscle}</p>
          <p className="label-mono text-[10px] tracking-widest text-text-muted">
            {region.group.toUpperCase()} · {region.stateLabel.toUpperCase()}
          </p>
        </div>
        {region.covered ? (
          <span className="ml-auto font-display text-xl font-semibold tabular-nums text-text-primary">
            {region.sets}
            <span className="ml-1 label-mono text-[10px] text-text-muted">sets</span>
          </span>
        ) : null}
      </div>
      {region.contributingExercises.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {region.contributingExercises.map((ex) => (
            <li key={ex.name} className="flex items-center justify-between px-3 py-2">
              <span className="font-sans text-sm text-text-secondary">{ex.name}</span>
              <span className="label-mono text-[11px] text-text-muted">{ex.sets} sets</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// The group → hue key both figures share.
function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {GROUP_ORDER.map((group) => (
        <span key={group} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ background: groupColorVar(group) }}
          />
          <span className="label-mono text-[10px] text-text-muted">{group}</span>
        </span>
      ))}
    </div>
  );
}

function FigureCaption({ label }: { label: string }) {
  return (
    <span className="label-mono text-[9px] tracking-widest text-text-muted">{label}</span>
  );
}

// ------------------------------------------------------------------ Variant A — baseline
export function VariantA({ selected, onSelect }: VariantProps) {
  const region = selected ? MOCK_REGIONS.get(selected) ?? null : null;
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          A · Current atlas (baseline)
        </h2>
        <p className="font-sans text-sm text-text-muted">
          What ships today: small muscle "blobs" floating on a mostly-empty silhouette. Here for a
          straight before/after against the redesign.
        </p>
      </header>
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex justify-center gap-6">
          {(["front", "back"] as View[]).map((view) => (
            <div key={view} className="flex flex-col items-center gap-2">
              <FigureCaption label={view} />
              <AtlasFigure
                figure="neutral"
                view={view}
                regionsByMuscle={MOCK_REGIONS}
                selectedMuscle={selected}
                onSelectMuscle={onSelect}
              />
            </div>
          ))}
        </div>
      </div>
      <Legend />
      <div className="rounded-xl border border-border bg-surface p-4">
        <MuscleDetail region={region} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Variant B — anatomical, twin
export function VariantB({ selected, onSelect }: VariantProps) {
  const region = selected ? MOCK_REGIONS.get(selected) ?? null : null;
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          B · Anatomical body map (front + back)
        </h2>
        <p className="font-sans text-sm text-text-muted">
          Fuller, contiguous muscles that tile the body — with fiber striations — the way Sasha's
          Body Map reads. Front and back side by side; tap for detail.
        </p>
      </header>
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex justify-center gap-6">
          {(["front", "back"] as View[]).map((view) => (
            <div key={view} className="flex flex-col items-center gap-2">
              <FigureCaption label={view} />
              <RedesignFigure
                figure="neutral"
                view={view}
                regionsByMuscle={MOCK_REGIONS}
                selectedMuscle={selected}
                onSelectMuscle={onSelect}
                maxWidth={210}
              />
            </div>
          ))}
        </div>
      </div>
      <Legend />
      <div className="rounded-xl border border-border bg-surface p-4">
        <MuscleDetail region={region} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Variant C — single + rail
export function VariantC({ selected, onSelect }: VariantProps) {
  const [view, setView] = useState<View>("front");
  const region = selected ? MOCK_REGIONS.get(selected) ?? null : null;
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          C · Single figure + detail rail
        </h2>
        <p className="font-sans text-sm text-text-muted">
          Same anatomical artwork, but one large figure with a front/back toggle and a persistent
          rail — legend always visible, detail stays open beside the body instead of a drawer.
        </p>
      </header>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center gap-1 rounded-md border border-border bg-elevated p-1">
            {(["front", "back"] as View[]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => setView(option)}
                className={cn(
                  "rounded-sm px-4 py-1.5 label-mono text-[11px] font-semibold uppercase tracking-widest transition-colors",
                  view === option
                    ? "bg-cyan/15 text-cyan"
                    : "text-text-muted hover:text-text-secondary",
                )}
              >
                {option}
              </button>
            ))}
          </div>
          <RedesignFigure
            figure="neutral"
            view={view}
            regionsByMuscle={MOCK_REGIONS}
            selectedMuscle={selected}
            onSelectMuscle={onSelect}
            maxWidth={300}
          />
        </div>
        <aside className="flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="mb-2.5 label-mono text-[10px] tracking-widest text-text-muted">GROUPS</p>
            <Legend />
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <MuscleDetail region={region} />
          </div>
        </aside>
      </div>
    </div>
  );
}

// The muscle-count line so the density difference between baseline and redesign is legible.
export const REDESIGN_MUSCLE_COUNT = REDESIGN_MUSCLES.length;
