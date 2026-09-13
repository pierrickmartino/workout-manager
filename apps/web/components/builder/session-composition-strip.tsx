"use client";

import { Link2 } from "lucide-react";

import {
  sectionBands,
  type SessionSectionKey,
} from "@/lib/session-section";
import type { DraftPrescription, SupersetSlot } from "@/lib/protocol-builder";
import { cn } from "@/lib/utils";

// The Session composition strip (CONTEXT: Session Section; ADR-0074) — the "visible workout
// composition" that sits above the editable Prescriptions (creative-directions idea 5).
// It groups the Session into its read-time Sections (warm-up / main work / accessory /
// cooldown, projected by `sectionBands`), one labeled tile per Exercise, brackets Superset
// members with their shared round instruction, and — on selecting a tile — moves focus to
// that Exercise's editable Prescription below. Pure presentation over the live draft: the
// sectioning and bracketing are the tested view-models (`session-section`, `supersetLayout`);
// this file only renders them and reports a selection.

interface SessionCompositionStripProps {
  prescriptions: DraftPrescription[];
  // The per-Prescription Superset layout (`supersetLayout(session.prescriptions)`), so the
  // strip brackets the same groups the editor does, from one source of truth.
  layout: SupersetSlot[];
  selectedPosition: number | null;
  onSelect: (position: number) => void;
}

interface SectionMeta {
  label: string;
  text: string;
  dot: string;
  bar: string;
}

// Presentation only — the section→colour mapping. The four Section keys come from the
// projection; the labels and accent tokens are the frontend's to choose (all real PULSE
// tokens). Literal class strings so Tailwind can see them.
const SECTION_META: Record<SessionSectionKey, SectionMeta> = {
  warm_up: { label: "WARM-UP", text: "text-amber", dot: "bg-amber", bar: "bg-amber-dim" },
  main: { label: "MAIN WORK", text: "text-cyan", dot: "bg-cyan", bar: "bg-cyan-dim" },
  accessory: {
    label: "ACCESSORIES",
    text: "text-violet",
    dot: "bg-violet",
    bar: "bg-violet-dim",
  },
  cooldown: { label: "COOLDOWN", text: "text-green", dot: "bg-green", bar: "bg-green-dim" },
};

// A render item within one section band: a solo Prescription, or the contiguous run of one
// Superset's members. Positions index back into the draft, so a tap selects the right row.
type BandItem =
  | { kind: "solo"; position: number }
  | { kind: "group"; group: string; positions: number[]; roundRestSeconds: number | null };

// Collapse a band's positions into render items, bracketing each contiguous Superset run —
// contiguity is a reducer invariant (ADR-0023), so a run of one group tag is the whole group.
function bandItems(positions: number[], layout: SupersetSlot[]): BandItem[] {
  const items: BandItem[] = [];
  let cursor = 0;
  while (cursor < positions.length) {
    const position = positions[cursor];
    const slot = layout[position];
    if (slot.group === null) {
      items.push({ kind: "solo", position });
      cursor += 1;
      continue;
    }
    const group = slot.group;
    const members: number[] = [];
    while (
      cursor < positions.length &&
      layout[positions[cursor]].group === group
    ) {
      members.push(positions[cursor]);
      cursor += 1;
    }
    items.push({
      kind: "group",
      group,
      positions: members,
      roundRestSeconds: layout[members[0]].roundRestSeconds,
    });
  }
  return items;
}

export function SessionCompositionStrip({
  prescriptions,
  layout,
  selectedPosition,
  onSelect,
}: SessionCompositionStripProps) {
  if (prescriptions.length === 0) return null;
  const bands = sectionBands(prescriptions);

  return (
    <div
      className="flex flex-col gap-4 rounded-md border border-border bg-base/40 p-3"
      aria-label="Workout composition"
    >
      <span className="label-mono text-[9px] text-text-muted">COMPOSITION</span>
      {bands.map((band, bandIndex) => {
        const meta = SECTION_META[band.section];
        return (
          <div key={`${band.section}-${bandIndex}`} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} aria-hidden />
              <span
                className={cn(
                  "label-mono shrink-0 text-[10px] font-semibold tracking-wider",
                  meta.text,
                )}
              >
                {meta.label}
              </span>
              <span className={cn("h-px flex-1", meta.bar)} />
              <span className="label-mono shrink-0 text-[9px] text-text-muted">
                {band.positions.length}
              </span>
            </div>

            <ul className="flex list-none flex-col gap-1.5 p-0">
              {bandItems(band.positions, layout).map((item) =>
                item.kind === "solo" ? (
                  <li key={`p-${item.position}`}>
                    <CompositionTile
                      prescription={prescriptions[item.position]}
                      slot={layout[item.position]}
                      meta={meta}
                      selected={item.position === selectedPosition}
                      onSelect={() => onSelect(item.position)}
                    />
                  </li>
                ) : (
                  <li key={`g-${item.group}-${item.positions[0]}`}>
                    <SupersetBracket
                      positions={item.positions}
                      prescriptions={prescriptions}
                      layout={layout}
                      meta={meta}
                      roundRestSeconds={item.roundRestSeconds}
                      selectedPosition={selectedPosition}
                      onSelect={onSelect}
                    />
                  </li>
                ),
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

interface CompositionTileProps {
  prescription: DraftPrescription;
  slot: SupersetSlot;
  meta: SectionMeta;
  selected: boolean;
  onSelect: () => void;
}

// One labeled tile: the Exercise name, a compact sets × target summary, and the A/B/C
// member badge when it rides in a Superset. Selecting it focuses the editable Prescription.
function CompositionTile({
  prescription,
  slot,
  meta,
  selected,
  onSelect,
}: CompositionTileProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md border bg-surface px-3 py-2 text-left transition-colors",
        selected
          ? "border-cyan ring-2 ring-cyan/30"
          : "border-border hover:border-border-lite",
      )}
    >
      {slot.memberLabel ? (
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-cyan/15 font-mono text-[10px] font-bold text-cyan"
          aria-label={`Superset member ${slot.memberLabel}`}
        >
          {slot.memberLabel}
        </span>
      ) : (
        <span className={cn("h-6 w-1 shrink-0 rounded-full", meta.dot)} aria-hidden />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-display text-[13px] font-semibold text-text-primary">
          {prescription.exerciseName}
        </span>
        <span className="label-mono text-[9px] text-text-muted">
          {prescription.sets} × {prescription.reps}
        </span>
      </span>
    </button>
  );
}

interface SupersetBracketProps {
  positions: number[];
  prescriptions: DraftPrescription[];
  layout: SupersetSlot[];
  meta: SectionMeta;
  roundRestSeconds: number | null;
  selectedPosition: number | null;
  onSelect: (position: number) => void;
}

// A Superset bracketed as a sub-card wrapping its member tiles, with the one shared round
// instruction at the foot — grouping reads before any field is opened (ADR-0023).
function SupersetBracket({
  positions,
  prescriptions,
  layout,
  meta,
  roundRestSeconds,
  selectedPosition,
  onSelect,
}: SupersetBracketProps) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-cyan/40 bg-cyan/5 p-2">
      <div className="flex items-center justify-between px-0.5">
        <span className="label-mono flex items-center gap-1 text-[9px] text-cyan">
          <Link2 className="h-3 w-3" aria-hidden />
          SUPERSET
        </span>
        <span className="label-mono text-[9px] text-text-muted">
          {positions.length} exercises · one round
        </span>
      </div>
      <ul className="flex list-none flex-col gap-1.5 p-0">
        {positions.map((position) => (
          <li key={`p-${position}`}>
            <CompositionTile
              prescription={prescriptions[position]}
              slot={layout[position]}
              meta={meta}
              selected={position === selectedPosition}
              onSelect={() => onSelect(position)}
            />
          </li>
        ))}
      </ul>
      <p className="label-mono px-0.5 text-[9px] text-cyan">
        ↻ Round rest {roundRestSeconds === null ? "—" : `${roundRestSeconds}s`} after each
        round
      </p>
    </div>
  );
}
