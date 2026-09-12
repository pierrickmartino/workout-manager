"use client";

// PROTOTYPE variant C — "Split navigator". A true master–detail: a persistent
// composition navigator on the left, the selected exercise's editor pinned on the
// right (they stack on a phone). The navigator groups exercises under expandable role
// headers (idea 1's expandable-card reveal, applied to the role group: collapse a role
// you're not working on to shrink the whole composition to its skeleton). The editor
// never scrolls away — you hop between tiles on the left and the same detail pane on
// the right updates. Superset members are bracketed inside their role group with the
// shared round instruction.

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import {
  ROLE_META,
  memberLabel,
  prescriptionSummary,
  supersetLetter,
  toRoleBands,
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

export const VARIANT_C_NAME = "Split navigator";

export function CompositionVariantC({
  session,
  selectedId,
  onSelect,
  onEditField,
}: VariantProps) {
  const bands = toRoleBands(session);
  const selected = session.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      {/* Master — the composition navigator. */}
      <nav
        aria-label="Workout composition"
        className="flex flex-col gap-2 md:w-2/5 md:shrink-0"
      >
        {bands.map((band) => (
          <RoleGroup
            key={band.role}
            band={band}
            session={session}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
      </nav>

      {/* Detail — the pinned editor. Sticky on wide screens so it stays in view while
          the navigator scrolls. */}
      <div className="flex-1 md:sticky md:top-4">
        <PrescriptionEditorCard prescription={selected} onEditField={onEditField} />
      </div>
    </div>
  );
}

// One expandable role group in the navigator. Open by default; collapsing it hides the
// tiles behind a one-line role summary so a big workout compresses to its skeleton.
function RoleGroup({
  band,
  session,
  selectedId,
  onSelect,
}: {
  band: ReturnType<typeof toRoleBands>[number];
  session: PrototypePrescription[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const meta = ROLE_META[band.role];
  const count = band.items.reduce(
    (n, item) => n + (item.kind === "solo" ? 1 : item.members.length),
    0,
  );
  return (
    <div className={cn("overflow-hidden rounded-md border", meta.border)}>
      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
          meta.bg,
        )}
      >
        <ChevronRight
          className={cn("h-3.5 w-3.5 transition-transform", meta.text, open && "rotate-90")}
          aria-hidden
        />
        <span className={cn("label-mono text-[10px] font-semibold tracking-wider", meta.text)}>
          {meta.label}
        </span>
        <span className="label-mono ml-auto text-[9px] text-text-muted">
          {count} {count === 1 ? "ex" : "ex"}
        </span>
      </button>

      {open ? (
        <ul className="flex list-none flex-col gap-1.5 p-2">
          {band.items.map((item, itemIndex) =>
            item.kind === "solo" ? (
              <li key={item.prescription.id}>
                <NavTile
                  prescription={item.prescription}
                  selected={item.prescription.id === selectedId}
                  onSelect={() => onSelect(item.prescription.id)}
                />
              </li>
            ) : (
              <li key={`grp-${itemIndex}`}>
                <SupersetCluster
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
      ) : null}
    </div>
  );
}

// A compact navigator row: name + summary, marked when it is the detail pane's subject.
function NavTile({
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
        "flex w-full items-center gap-2 rounded-sm border px-2.5 py-2 text-left transition-colors",
        selected
          ? cn("bg-surface", meta.border, "ring-1", meta.ring)
          : "border-transparent hover:bg-surface",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-display text-[13px] font-semibold text-text-primary">
          {prescription.name}
        </span>
        <span className="label-mono text-[9px] text-text-muted">
          {prescriptionSummary(prescription)}
        </span>
      </span>
      {selected ? (
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", meta.dot)} aria-hidden />
      ) : null}
    </button>
  );
}

// A superset bracketed inside the role group, member letters + shared round rest.
function SupersetCluster({
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
    <div className="rounded-md border border-cyan/40 bg-cyan/5 p-1.5">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="label-mono text-[9px] text-cyan">SUPERSET {letter}</span>
        <span className="label-mono text-[9px] text-text-muted">
          ↻ {roundRestSeconds === null ? "—" : `${roundRestSeconds}s`}
        </span>
      </div>
      <ul className="flex list-none flex-col gap-1 p-0">
        {members.map((member, index) => (
          <li key={member.id} className="flex items-center gap-1.5">
            <span
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-cyan/15 font-mono text-[9px] font-bold text-cyan"
              aria-label={`Superset member ${memberLabel(index)}`}
            >
              {memberLabel(index)}
            </span>
            <span className="min-w-0 flex-1">
              <NavTile
                prescription={member}
                selected={member.id === selectedId}
                onSelect={() => onSelect(member.id)}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
