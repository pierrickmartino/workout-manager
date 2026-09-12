"use client";

// PROTOTYPE variant A — "Role bands". The composition is the page: four stacked,
// colour-coded role sections (WARM-UP / MAIN WORK / ACCESSORIES / COOLDOWN), each a
// full-width band of labeled tiles. Roles are the dominant structure; you read the
// shape of the whole workout top-to-bottom before touching a field. Selecting a tile
// expands its editor inline, right under the band it lives in — the editor never
// leaves the exercise's context. Superset members sit inside a bracketed sub-card
// carrying the one shared round instruction.

import {
  ROLE_META,
  memberLabel,
  prescriptionSummary,
  supersetLetter,
  toRoleBands,
  type PrototypePrescription,
  type RenderItem,
} from "./composition-data";
import { PrescriptionEditorCard } from "./prescription-editor-card";
import { cn } from "@/lib/utils";

interface VariantProps {
  session: PrototypePrescription[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onEditField: (
    id: number,
    field: "sets" | "target" | "load" | "restSeconds" | "note",
    value: string,
  ) => void;
}

export const VARIANT_A_NAME = "Role bands";

export function CompositionVariantA({
  session,
  selectedId,
  onSelect,
  onEditField,
}: VariantProps) {
  const bands = toRoleBands(session);
  const selected = session.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      {bands.map((band) => {
        const meta = ROLE_META[band.role];
        const count = band.items.reduce(
          (n, item) => n + (item.kind === "solo" ? 1 : item.members.length),
          0,
        );
        // The editor mounts inline beneath the band that owns the selected exercise,
        // so focus stays next to where you picked it.
        const bandOwnsSelection = band.items.some((item) =>
          item.kind === "solo"
            ? item.prescription.id === selectedId
            : item.members.some((m) => m.id === selectedId),
        );
        return (
          <div key={band.role} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", meta.dot)} aria-hidden />
              <span className={cn("label-mono shrink-0 text-[11px] font-semibold tracking-wider", meta.text)}>
                {meta.label}
              </span>
              <span className={cn("h-px flex-1", meta.bg)} />
              <span className="label-mono shrink-0 text-[10px] text-text-muted">
                {count} {count === 1 ? "exercise" : "exercises"}
              </span>
            </div>

            <ul className="flex list-none flex-col gap-2 p-0">
              {band.items.map((item, itemIndex) =>
                item.kind === "solo" ? (
                  <li key={item.prescription.id}>
                    <Tile
                      prescription={item.prescription}
                      selected={item.prescription.id === selectedId}
                      onSelect={() => onSelect(item.prescription.id)}
                    />
                  </li>
                ) : (
                  <li key={`${band.role}-grp-${itemIndex}`}>
                    <SupersetBracket
                      members={item.members}
                      letter={supersetLetter(session, item.group)}
                      roundRestSeconds={item.roundRestSeconds}
                      selectedId={selectedId}
                      onSelect={onSelect}
                    />
                  </li>
                ),
              )}
            </ul>

            {bandOwnsSelection && selected ? (
              <PrescriptionEditorCard
                prescription={selected}
                onEditField={onEditField}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// A single labeled composition tile: name, one-line prescription summary, chevron
// hint. Selecting it focuses the editor (the tile is the collapsed card; the editor
// is its expansion — idea 1's expandable-card reveal).
function Tile({
  prescription,
  selected,
  onSelect,
}: {
  prescription: PrototypePrescription;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = ROLE_META[prescription.role];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-3 rounded-md border bg-surface px-3 py-2.5 text-left transition-colors",
        selected
          ? cn(meta.border, "ring-2", meta.ring)
          : "border-border hover:border-border-lite",
      )}
    >
      <span className={cn("h-8 w-1 shrink-0 rounded-full", meta.dot)} aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-display text-[14px] font-semibold text-text-primary">
          {prescription.name}
        </span>
        <span className="label-mono text-[10px] text-text-muted">
          {prescriptionSummary(prescription)}
        </span>
      </span>
      <span
        className={cn(
          "label-mono shrink-0 text-[9px]",
          selected ? meta.text : "text-text-muted",
        )}
      >
        {selected ? "EDITING" : "EDIT"}
      </span>
    </button>
  );
}

// A superset rendered as a bracketed sub-card wrapping its member tiles, with one
// shared round instruction at the foot — grouping is legible before any field is opened.
function SupersetBracket({
  members,
  letter,
  roundRestSeconds,
  selectedId,
  onSelect,
}: {
  members: PrototypePrescription[];
  letter: string;
  roundRestSeconds: number | null;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-cyan/40 bg-cyan/5 p-2.5">
      <div className="flex items-center justify-between px-0.5">
        <span className="label-mono text-[9px] text-cyan">SUPERSET {letter}</span>
        <span className="label-mono text-[9px] text-text-muted">
          {members.length} exercises · one round
        </span>
      </div>
      <ul className="flex list-none flex-col gap-2 p-0">
        {members.map((member, index) => (
          <li key={member.id} className="flex items-stretch gap-2">
            <span
              className="flex w-6 shrink-0 items-center justify-center rounded-sm bg-cyan/15 font-mono text-[11px] font-bold text-cyan"
              aria-label={`Superset member ${memberLabel(index)}`}
            >
              {memberLabel(index)}
            </span>
            <span className="min-w-0 flex-1">
              <Tile
                prescription={member}
                selected={member.id === selectedId}
                onSelect={() => onSelect(member.id)}
              />
            </span>
          </li>
        ))}
      </ul>
      <p className="label-mono text-[10px] text-cyan">
        ↻ Round rest{" "}
        {roundRestSeconds === null ? "—" : `${roundRestSeconds}s`} after each round
      </p>
    </div>
  );
}
