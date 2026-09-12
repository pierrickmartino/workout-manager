"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { AtlasRegion, AtlasView } from "@/lib/muscle-atlas-view";
import {
  GROUP_COLOR,
  GROUP_COLOR_FALLBACK,
  GROUP_VAR,
  GROUP_VAR_FALLBACK,
} from "@/components/pulse/muscle-colors";
import { SectionHeader } from "@/components/pulse/section-header";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AtlasBody } from "./atlas-body";

interface MuscleAtlasProps {
  view: AtlasView;
}

// The Muscle Atlas (task #9, replacing the anonymous Muscle Coverage checklist): a front +
// back body silhouette with the six real Muscle Groups as selectable regions, heat-shaded by
// recent volume, over the fixed range-independent 8-week window (ADR-0025). Selecting a
// region — on the body or in the list — opens a bottom drawer naming its mapped sets and the
// exercises behind them; a text list stays visible beneath, including any off-map work. It is
// **descriptive only**: an untrained region reads as a neutral faint outline, never a "train
// this" nudge, and nothing is ranked. Accessibility: every region and row is a real control
// with a composed label, so nothing rides on color. A thin client shell over the
// `muscle-atlas-view` view-model.
export function MuscleAtlas({ view }: MuscleAtlasProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const regionsByGroup = useMemo(
    () => new Map(view.regions.map((region) => [region.group, region])),
    [view.regions],
  );
  const selectedRegion = selected ? regionsByGroup.get(selected) ?? null : null;

  function handleSelect(group: string) {
    if (selected === group) {
      setSelected(null);
      return;
    }
    triggerRef.current = (document.activeElement as HTMLElement) ?? null;
    setSelected(group);
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
            <AtlasBody view="front" regionsByGroup={regionsByGroup} selectedGroup={null} onSelectGroup={() => {}} />
            <AtlasBody view="back" regionsByGroup={regionsByGroup} selectedGroup={null} onSelectGroup={() => {}} />
          </div>
          <p className="text-center font-sans text-sm text-text-secondary">
            No training logged in the {view.weeksLabel} yet. Log a few sessions and each
            Muscle Group you train will light up on the atlas.
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
          <BodyFigure label="Front">
            <AtlasBody
              view="front"
              regionsByGroup={regionsByGroup}
              selectedGroup={selected}
              onSelectGroup={handleSelect}
            />
          </BodyFigure>
          <BodyFigure label="Back">
            <AtlasBody
              view="back"
              regionsByGroup={regionsByGroup}
              selectedGroup={selected}
              onSelectGroup={handleSelect}
            />
          </BodyFigure>
        </div>
      </Card>

      <SectionHeader meta="tap for detail">COVERAGE</SectionHeader>
      <CoverageList regions={view.regions} selected={selected} onSelect={handleSelect} />

      {view.footnote ? (
        <p className="font-sans text-[13px] text-text-muted">{view.footnote}</p>
      ) : null}
      <p className="font-sans text-[13px] text-text-muted">
        Descriptive only — presence and volume over a fixed window. Nothing here flags an
        under-trained group or prescribes work.
      </p>

      <RegionDrawer region={selectedRegion} weeksLabel={view.weeksLabel} onClose={handleClose} />
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
  regions: AtlasRegion[];
  selected: string | null;
  onSelect: (group: string) => void;
}

// The text list beneath the atlas: one row per real group carrying its color swatch, state,
// set count, share, and top exercise — everything the body conveys, in text, so the section
// is legible without the map. Rows are the same selection affordance as the regions.
function CoverageList({ regions, selected, onSelect }: CoverageListProps) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
      {regions.map((region) => (
        <li key={region.group}>
          <button
            type="button"
            aria-pressed={selected === region.group}
            aria-label={region.ariaLabel}
            onClick={() => onSelect(region.group)}
            className={cn(
              "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-elevated",
              selected === region.group && "bg-elevated",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "h-2.5 w-2.5 shrink-0 rounded-[3px]",
                region.covered
                  ? GROUP_COLOR[region.group] ?? GROUP_COLOR_FALLBACK
                  : "border border-border-lite",
              )}
            />
            <span aria-hidden className="min-w-0 flex-1">
              <span className="block font-sans text-[15px] font-medium text-text-primary">
                {region.group}
              </span>
              <span className="mt-0.5 block label-mono text-[10px] text-text-muted">
                {region.covered
                  ? `${region.sets} sets · ${region.sharePct}%${region.topExercise ? ` · top: ${region.topExercise}` : ""}`
                  : "Not trained yet"}
              </span>
              {region.covered ? (
                <span className="mt-1.5 block h-1 overflow-hidden rounded-[2px] bg-elevated">
                  <span
                    className="block h-full rounded-[2px]"
                    style={{
                      width: `${Math.round(region.intensity * 100)}%`,
                      background: GROUP_VAR[region.group] ?? GROUP_VAR_FALLBACK,
                    }}
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
        </li>
      ))}
    </ul>
  );
}

interface RegionDrawerProps {
  region: AtlasRegion | null;
  weeksLabel: string;
  onClose: () => void;
}

// The region-detail bottom sheet (the shadcn Drawer pattern, task #9): slides up when a
// region is selected, naming its mapped sets, its share of the window, and the exercises
// behind them. Kept in the DOM for a two-way slide, made inert + hidden from assistive tech
// when closed, and dismissed by the scrim or Escape.
function RegionDrawer({ region, weeksLabel, onClose }: RegionDrawerProps) {
  const open = region !== null;
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    sheetRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/55 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={region ? `${region.group} detail` : undefined}
        aria-hidden={!open}
        inert={!open}
        tabIndex={-1}
        className={cn(
          "fixed bottom-0 left-1/2 z-50 w-full max-w-[26rem] -translate-x-1/2 rounded-t-2xl border border-b-0 border-border bg-surface px-5 pb-7 pt-2 shadow-2xl outline-none transition-transform duration-200",
          open ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div aria-hidden className="mx-auto mb-4 mt-1.5 h-1 w-9 rounded-full bg-border-lite" />
        {region ? <RegionDetail region={region} weeksLabel={weeksLabel} /> : null}
      </div>
    </>
  );
}

function RegionDetail({ region, weeksLabel }: { region: AtlasRegion; weeksLabel: string }) {
  const color = GROUP_VAR[region.group] ?? GROUP_VAR_FALLBACK;
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: color }} />
        <span className="font-display text-lg font-semibold text-text-primary">{region.group}</span>
        <span
          className={cn(
            "ml-auto label-mono text-[10px] font-semibold",
            region.covered ? "text-text-primary" : "text-text-muted",
          )}
        >
          {region.stateLabel}
        </span>
      </div>

      {region.covered ? (
        <>
          <div className="mt-4 flex gap-8">
            <Stat label="Mapped sets" value={String(region.sets)} />
            <Stat label="Share of window" value={`${region.sharePct}%`} />
          </div>
          <p className="mt-4 mb-2 label-mono text-[9px] tracking-wider text-text-muted">
            Contributing exercises
          </p>
          <ul className="divide-y divide-border">
            {region.contributingExercises.map((exercise) => (
              <li key={exercise.name} className="flex items-center justify-between py-2">
                <span className="font-sans text-sm text-text-primary">{exercise.name}</span>
                <span className="label-mono text-[11px] text-text-secondary">
                  {exercise.sets} {exercise.sets === 1 ? "set" : "sets"}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-3 font-sans text-sm text-text-secondary">
          No {region.group.toLowerCase()} sets in the {weeksLabel} yet. When you log some,
          they&apos;ll map here.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label-mono text-[9px] tracking-wider text-text-muted">{label}</span>
      <span className="font-display text-2xl font-semibold text-text-primary tabular-nums">{value}</span>
    </div>
  );
}
