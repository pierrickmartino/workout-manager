"use client";

// PROTOTYPE variant B — "Timeline bar". The composition is one compact, horizontally
// scrollable strip along the top: a proportional role ribbon (how much of the workout
// is warm-up vs main vs accessories vs cooldown) sitting over a single row of ordered
// tiles. The whole shape reads in one glance, left-to-right, like a track. A superset
// pair is a bracket spanning its adjacent tiles with the round instruction tucked
// beneath. Selecting a tile drops its editor into a detail pane below the strip — the
// strip stays put as a fixed navigator while you edit.

import {
  ROLE_META,
  ROLE_ORDER,
  memberLabel,
  supersetLetter,
  toRenderItems,
  type PrototypePrescription,
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

export const VARIANT_B_NAME = "Timeline bar";

export function CompositionVariantB({
  session,
  selectedId,
  onSelect,
  onEditField,
}: VariantProps) {
  const items = toRenderItems(session);
  const selected = session.find((p) => p.id === selectedId) ?? null;

  // The proportional role ribbon: one segment per role present, width ∝ exercise count.
  const roleCounts = ROLE_ORDER.map((role) => ({
    role,
    count: session.filter((p) => p.role === role).length,
  })).filter((entry) => entry.count > 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Role ribbon — the at-a-glance mix of the whole workout. */}
      <div className="flex flex-col gap-2">
        <div className="flex h-2 w-full overflow-hidden rounded-full">
          {roleCounts.map((entry) => (
            <span
              key={entry.role}
              className={cn("h-full", ROLE_META[entry.role].dot)}
              style={{ flexGrow: entry.count }}
              aria-hidden
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {roleCounts.map((entry) => {
            const meta = ROLE_META[entry.role];
            return (
              <span key={entry.role} className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", meta.dot)} aria-hidden />
                <span className={cn("label-mono text-[9px]", meta.text)}>
                  {meta.label}
                </span>
                <span className="label-mono text-[9px] text-text-muted">
                  ×{entry.count}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* The tile track — one horizontal row of ordered tiles, scrollable on narrow
          screens. Solo tiles sit bare; a superset's members ride inside a bracket. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-2">
        <ol className="flex list-none items-stretch gap-2 p-0">
          {items.map((item, index) =>
            item.kind === "solo" ? (
              <li key={item.prescription.id}>
                <TrackTile
                  prescription={item.prescription}
                  selected={item.prescription.id === selectedId}
                  onSelect={() => onSelect(item.prescription.id)}
                />
              </li>
            ) : (
              <li key={`grp-${index}`}>
                <SupersetSpan
                  members={item.members}
                  letter={supersetLetter(session, item.group)}
                  roundRestSeconds={item.roundRestSeconds}
                  selectedId={selectedId}
                  onSelect={onSelect}
                />
              </li>
            ),
          )}
        </ol>
      </div>

      {/* Detail pane — the selected tile's editor, below the fixed strip. */}
      <PrescriptionEditorCard prescription={selected} onEditField={onEditField} />
    </div>
  );
}

// A fixed-width tile in the horizontal track: role stripe on top, name, summary.
function TrackTile({
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
        "flex h-full w-32 flex-col gap-1.5 rounded-md border bg-surface p-2.5 text-left transition-colors",
        selected
          ? cn(meta.border, "ring-2", meta.ring)
          : "border-border hover:border-border-lite",
      )}
    >
      <span className={cn("h-1 w-8 rounded-full", meta.dot)} aria-hidden />
      <span className="line-clamp-2 min-h-8 font-display text-[13px] font-semibold leading-tight text-text-primary">
        {prescription.name}
      </span>
      <span className="label-mono text-[10px] text-text-muted">
        {prescription.sets} × {prescription.target}
      </span>
      <span className={cn("label-mono text-[9px]", selected ? meta.text : "text-text-muted")}>
        {prescription.load === "bodyweight" ? "BW" : prescription.load}
      </span>
    </button>
  );
}

// A superset spanning adjacent track tiles, drawn as a bracketed cluster with the
// member letters and one shared round instruction beneath.
function SupersetSpan({
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
    <div className="flex h-full flex-col gap-1.5 rounded-lg border border-cyan/40 bg-cyan/5 p-1.5">
      <div className="flex items-stretch gap-1.5">
        {members.map((member, index) => (
          <div key={member.id} className="relative">
            <span
              className="absolute left-1 top-1 z-10 flex h-4 w-4 items-center justify-center rounded-sm bg-cyan/80 font-mono text-[9px] font-bold text-on-accent"
              aria-label={`Superset member ${memberLabel(index)}`}
            >
              {memberLabel(index)}
            </span>
            <TrackTile
              prescription={member}
              selected={member.id === selectedId}
              onSelect={() => onSelect(member.id)}
            />
          </div>
        ))}
      </div>
      <p className="label-mono px-0.5 text-[9px] text-cyan">
        ↻ SUPERSET {letter} · round rest{" "}
        {roundRestSeconds === null ? "—" : `${roundRestSeconds}s`}
      </p>
    </div>
  );
}
