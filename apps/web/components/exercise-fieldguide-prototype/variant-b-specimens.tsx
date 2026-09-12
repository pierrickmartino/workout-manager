"use client";

// PROTOTYPE — Field Guide, Variant B: "Specimen Plates".
//
// Illustration-forward. A responsive gallery of specimen plates, each dominated by the
// movement glyph on a tinted card — you browse by picture, like plates in a field guide,
// with the name and metadata beneath. Tapping a plate morphs its glyph up into the detail
// dialog. A structurally different hierarchy from the list: picture first, text second.
// See README.md.

import {
  classifyMovementFamily,
  FAMILY_LABEL,
} from "@/lib/prototype/movement-family";
import { MovementGlyph } from "./movement-glyph";
import { EquipmentSymbol } from "./equipment-symbol";
import type { FieldGuideVariantProps } from "./variant-types";

export function VariantBSpecimens({
  results,
  onOpen,
  resolveGlyphName,
}: FieldGuideVariantProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {results.map((exercise) => {
        const verdict = classifyMovementFamily(exercise);
        return (
          <button
            key={exercise.id}
            type="button"
            onClick={() => onOpen(exercise)}
            className="group flex flex-col overflow-hidden rounded-lg border border-border bg-surface text-left transition-colors hover:border-cyan/50"
          >
            {/* The plate: the glyph large on a faint grid-paper ground. */}
            <span
              className="relative flex aspect-square items-center justify-center bg-elevated/60 text-text-primary"
              style={{
                viewTransitionName: resolveGlyphName(exercise.id),
                backgroundImage:
                  "radial-gradient(currentColor 0.5px, transparent 0.5px)",
                backgroundSize: "10px 10px",
                color: "var(--color-border-lite)",
              }}
            >
              <span className="text-text-primary transition-transform group-hover:scale-105">
                <MovementGlyph
                  family={verdict.family}
                  dimmed={verdict.confidence === "inferred"}
                  className="h-16 w-16"
                />
              </span>
              <span className="absolute left-2 top-2 label-mono text-[8px] text-cyan">
                {FAMILY_LABEL[verdict.family]}
              </span>
            </span>
            <span className="flex flex-col gap-1.5 p-2.5">
              <span className="line-clamp-2 font-sans text-[13px] leading-snug text-text-primary">
                {exercise.name}
              </span>
              <EquipmentSymbol equipment={exercise.required_equipment} showOverflowCount />
            </span>
          </button>
        );
      })}
    </div>
  );
}
