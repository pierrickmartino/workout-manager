"use client";

// PROTOTYPE — Field Guide, Variant A: "Field Guide Index".
//
// The most conservative take — keeps today's vertical list, but each row becomes a
// field-guide entry: a bordered glyph "plate" on the left, then name, movement-family
// tag, plain-language muscle summary, and an equipment symbol. Tapping a row opens the
// morphing detail dialog (the glyph flies up into the panel hero). See README.md.

import { ChevronRight } from "lucide-react";

import {
  classifyMovementFamily,
  FAMILY_LABEL,
} from "@/lib/prototype/movement-family";
import { plainMuscleSummary } from "@/lib/prototype/plain-muscle-summary";
import { MovementGlyph } from "./movement-glyph";
import { EquipmentSymbol } from "./equipment-symbol";
import type { FieldGuideVariantProps } from "./variant-types";

export function VariantAIndex({
  results,
  onOpen,
  resolveGlyphName,
}: FieldGuideVariantProps): React.JSX.Element {
  return (
    <ul className="flex flex-col gap-2">
      {results.map((exercise) => {
        const verdict = classifyMovementFamily(exercise);
        const summary = plainMuscleSummary(exercise.targeted_muscles);
        return (
          <li key={exercise.id}>
            <button
              type="button"
              onClick={() => onOpen(exercise)}
              className="flex w-full items-center gap-3.5 rounded-md border border-border bg-base p-3 text-left transition-colors hover:border-cyan/50 hover:bg-surface"
            >
              <span
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-text-primary"
                style={{ viewTransitionName: resolveGlyphName(exercise.id) }}
              >
                <MovementGlyph
                  family={verdict.family}
                  dimmed={verdict.confidence === "inferred"}
                  className="h-9 w-9"
                />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="truncate font-sans text-[15px] text-text-primary">
                    {exercise.name}
                  </span>
                  <span className="label-mono text-[9px] text-cyan">
                    {FAMILY_LABEL[verdict.family]}
                  </span>
                </span>
                {summary ? (
                  <span className="truncate font-sans text-[12px] text-text-secondary">
                    {summary}
                  </span>
                ) : null}
                <EquipmentSymbol equipment={exercise.required_equipment} showOverflowCount />
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
