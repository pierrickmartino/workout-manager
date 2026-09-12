"use client";

// PROTOTYPE — Field Guide, Variant C: "Taxonomy".
//
// Reframes discovery around the field guide's own structure: the whole result set is
// reorganised into collapsible MOVEMENT-FAMILY sections (Squat, Hinge, Push, Pull, Carry,
// Locomotion, Core, then the generic bucket). Each section header is a family plate with
// its blurb and a count; the exercises live beneath. The taxonomy IS the navigation. Pairs
// with the bottom Drawer detail surface (owned by the container). See README.md.

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import {
  classifyMovementFamily,
  FAMILY_BLURB,
  FAMILY_LABEL,
  FAMILY_ORDER,
  type MovementFamily,
} from "@/lib/prototype/movement-family";
import type { ExerciseSearchResult } from "@/lib/exercises-types";
import { MovementGlyph } from "./movement-glyph";
import { EquipmentSymbol } from "./equipment-symbol";
import type { FieldGuideVariantProps } from "./variant-types";

export function VariantCTaxonomy({
  results,
  onOpen,
}: FieldGuideVariantProps): React.JSX.Element {
  // Group the current results by family, preserving the catalog order within each.
  const groups = new Map<MovementFamily, ExerciseSearchResult[]>();
  for (const exercise of results) {
    const { family } = classifyMovementFamily(exercise);
    const bucket = groups.get(family) ?? [];
    bucket.push(exercise);
    groups.set(family, bucket);
  }

  // Only families with members render, in the canonical order.
  const sections = FAMILY_ORDER.filter((family) => (groups.get(family)?.length ?? 0) > 0);

  // Collapsed set — everything starts open so the whole catalog is scannable; the header
  // toggles a family shut.
  const [collapsed, setCollapsed] = useState<Set<MovementFamily>>(new Set());
  const toggle = (family: MovementFamily) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(family)) next.delete(family);
      else next.add(family);
      return next;
    });

  return (
    <div className="flex flex-col gap-3">
      {sections.map((family) => {
        const members = groups.get(family) ?? [];
        const isOpen = !collapsed.has(family);
        return (
          <section
            key={family}
            className="overflow-hidden rounded-lg border border-border bg-surface"
          >
            <button
              type="button"
              onClick={() => toggle(family)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-elevated/50"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-base text-cyan">
                <MovementGlyph family={family} className="h-7 w-7" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2">
                  <span className="font-display text-[15px] font-semibold text-text-primary">
                    {FAMILY_LABEL[family]}
                  </span>
                  <span className="label-mono text-[9px] text-text-muted">
                    {members.length}
                  </span>
                </span>
                <span className="truncate font-sans text-[11px] text-text-muted">
                  {FAMILY_BLURB[family]}
                </span>
              </span>
              {isOpen ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
              )}
            </button>

            {isOpen ? (
              <ul className="border-t border-border">
                {members.map((exercise) => (
                  <li key={exercise.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(exercise)}
                      className="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-elevated/40"
                    >
                      <MovementGlyph
                        family={classifyMovementFamily(exercise).family}
                        dimmed
                        className="h-5 w-5 shrink-0 text-text-muted"
                      />
                      <span className="min-w-0 flex-1 truncate font-sans text-[13px] text-text-primary">
                        {exercise.name}
                      </span>
                      <EquipmentSymbol equipment={exercise.required_equipment} />
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-text-muted"
                        aria-hidden
                      />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
