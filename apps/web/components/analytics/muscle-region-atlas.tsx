"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import type {
  MuscleGroupSection,
  MuscleRegion,
  MuscleRegionAtlasView,
} from "@/lib/muscle-region-atlas-view";
import { setsWord } from "@/lib/muscle-atlas-labels";
import type { Figure, View } from "@/lib/atlas/atlas-geometry";
import { groupColorVar } from "@/components/pulse/muscle-colors";
import { SectionHeader } from "@/components/pulse/section-header";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AtlasFigure } from "./atlas-figure";
import { AtlasDrawer } from "./atlas-drawer";

const VIEWS: { view: View; label: string }[] = [
  { view: "front", label: "Front" },
  { view: "back", label: "Back" },
];

interface MuscleRegionAtlasProps {
  view: MuscleRegionAtlasView;
  figure: Figure;
}

// The Muscle Atlas (issue #543 / ADR-0079, superseding the six-region silhouette of ADR-0073):
// the detailed anatomical body map, front + back, heat-shaded per individual Muscle over the
// enriched per-muscle coverage read (issue #540/#541), with the figure chosen by `Profile.gender`
// (neutral fallback). Tapping or keyboard-activating a muscle — on the body or in the list —
// opens a labeled drawer naming the muscle, its parent group, its in-window sets, and the
// exercises behind them. A two-level group→muscle text list stays beneath so the section is fully
// legible without the illustration; every row is a real control with a composed aria-label. It is
// **descriptive only** (ADR-0025): an untrained muscle reads as a neutral faint outline, never a
// "train this" nudge, and nothing is ranked. A thin client shell over the
// `muscle-region-atlas-view` view-model.
export function MuscleRegionAtlas({ view, figure }: MuscleRegionAtlasProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const regionsByMuscle = useMemo(
    () => new Map(view.regions.map((region) => [region.muscle, region])),
    [view.regions],
  );
  const selectedRegion = selected ? regionsByMuscle.get(selected) ?? null : null;

  function handleSelect(muscle: string) {
    if (selected === muscle) {
      setSelected(null);
      return;
    }
    triggerRef.current = (document.activeElement as HTMLElement) ?? null;
    setSelected(muscle);
  }

  function handleClose() {
    setSelected(null);
    triggerRef.current?.focus();
  }

  if (view.isEmpty) {
    return (
      <div className="flex flex-col gap-4">
        <SectionHeader meta={view.weeksLabel}>MUSCLE ATLAS</SectionHeader>
        <Card className="flex flex-col items-center gap-4 p-6">
          <div className="flex justify-center gap-2">
            {VIEWS.map(({ view: bodyView }) => (
              <AtlasFigure
                key={bodyView}
                figure={figure}
                view={bodyView}
                regionsByMuscle={regionsByMuscle}
                selectedMuscle={null}
                onSelectMuscle={() => {}}
                interactive={false}
              />
            ))}
          </div>
          <p className="text-center font-sans text-sm text-text-secondary">
            No training logged in the {view.weeksLabel} yet. Log a few sessions and each
            muscle you train will light up on the atlas.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader meta={view.weeksLabel}>MUSCLE ATLAS</SectionHeader>

      <Card className="p-5">
        <div className="flex justify-center gap-4">
          {VIEWS.map(({ view: bodyView, label }) => (
            <BodyFigure key={bodyView} label={label}>
              <AtlasFigure
                figure={figure}
                view={bodyView}
                regionsByMuscle={regionsByMuscle}
                selectedMuscle={selected}
                onSelectMuscle={handleSelect}
              />
            </BodyFigure>
          ))}
        </div>
      </Card>

      <SectionHeader meta="tap for detail">COVERAGE</SectionHeader>
      <CoverageList groups={view.groups} selected={selected} onSelect={handleSelect} />

      {view.footnote ? (
        <p className="font-sans text-[13px] text-text-muted">{view.footnote}</p>
      ) : null}
      <p className="font-sans text-[13px] text-text-muted">
        Descriptive only — presence and volume over a fixed window. Nothing here flags an
        under-trained muscle or prescribes work.
      </p>

      <AtlasDrawer region={selectedRegion} weeksLabel={view.weeksLabel} onClose={handleClose} />
    </div>
  );
}

function BodyFigure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      <span className="label-mono text-[9px] tracking-widest text-text-muted">{label}</span>
      {children}
    </div>
  );
}

interface CoverageListProps {
  groups: MuscleGroupSection[];
  selected: string | null;
  onSelect: (muscle: string) => void;
}

// The two-level text list beneath the map (issue #543): the six Muscle Groups, each a real
// control that expands to its muscles, so the section is fully legible without the illustration.
// A group whose muscle is selected is auto-expanded so the list mirrors the body map. Every group
// header and muscle row carries a composed aria-label naming state + volume — nothing rides on
// color or the SVG.
function CoverageList({ groups, selected, onSelect }: CoverageListProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // The group of the selected muscle is always shown expanded, so selecting on the body map
  // reveals the matching row without the user hunting for it.
  const selectedGroup = selected
    ? groups.find((group) => group.muscles.some((muscle) => muscle.muscle === selected))?.group
    : undefined;

  function isOpen(group: string): boolean {
    return expanded.has(group) || group === selectedGroup;
  }

  function toggle(group: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  }

  return (
    <ul className="flex flex-col gap-2">
      {groups.map((group) => {
        const open = isOpen(group.group);
        const color = groupColorVar(group.group);
        return (
          <li
            key={group.group}
            className="overflow-hidden rounded-md border border-border bg-surface"
          >
            <button
              type="button"
              aria-expanded={open}
              aria-label={group.ariaLabel}
              onClick={() => toggle(group.group)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-elevated"
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={
                  group.covered
                    ? { background: color }
                    : { border: "1px solid var(--color-border-lite)" }
                }
              />
              <span aria-hidden className="min-w-0 flex-1">
                <span className="block font-sans text-[15px] font-medium text-text-primary">
                  {group.group}
                </span>
                <span className="mt-0.5 block label-mono text-[10px] text-text-muted">
                  {group.covered
                    ? `${group.trainedCount} of ${group.muscleCount} muscles trained`
                    : "Not trained yet"}
                </span>
              </span>
              <ChevronDown
                aria-hidden
                className={cn(
                  "h-4 w-4 shrink-0 text-text-muted transition-transform duration-150 motion-reduce:transition-none",
                  open && "rotate-180",
                )}
              />
            </button>
            {open ? (
              <ul className="divide-y divide-border border-t border-border">
                {group.muscles.map((muscle) => (
                  <li key={muscle.muscle}>
                    <MuscleRow
                      region={muscle}
                      selected={selected === muscle.muscle}
                      onSelect={onSelect}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

interface MuscleRowProps {
  region: MuscleRegion;
  selected: boolean;
  onSelect: (muscle: string) => void;
}

// One muscle row inside an expanded group: a real control opening the same drawer as the body
// map, carrying the region's set count and heat bar (when trained) and its composed aria-label.
function MuscleRow({ region, selected, onSelect }: MuscleRowProps) {
  const color = groupColorVar(region.group);
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={region.ariaLabel}
      onClick={() => onSelect(region.muscle)}
      className={cn(
        "flex w-full items-center gap-3 py-2.5 pl-9 pr-4 text-left transition-colors hover:bg-elevated",
        selected && "bg-elevated",
      )}
    >
      <span aria-hidden className="min-w-0 flex-1">
        <span className="block font-sans text-sm text-text-primary">{region.muscle}</span>
        <span className="mt-0.5 block label-mono text-[10px] text-text-muted">
          {region.covered ? `${region.sets} ${setsWord(region.sets)}` : "Not trained"}
        </span>
        {region.covered ? (
          <span className="mt-1.5 block h-1 overflow-hidden rounded-[2px] bg-elevated">
            <span
              className="block h-full rounded-[2px]"
              style={{ width: `${Math.round(region.intensity * 100)}%`, background: color }}
            />
          </span>
        ) : null}
      </span>
      <span
        aria-hidden
        className={cn(
          "label-mono shrink-0 text-[10px] font-semibold",
          region.covered ? "text-text-primary" : "text-text-muted",
        )}
      >
        {region.stateLabel}
      </span>
    </button>
  );
}
