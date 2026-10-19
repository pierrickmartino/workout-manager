"use client";

// PROTOTYPE — throwaway. Three variants of the /exercises catalog list, switchable via
// `?variant=` (current | A | B | C) on the existing route; the search, facets and detail
// drawer above/around them are unchanged. Question: what layout makes every exercise name
// readable (no truncation) and gives the categories illustrations that actually read?
//
//   A  Plates   — illustrated banner per pattern, two-line rows, names wrap, no per-row glyph.
//   B  Gallery  — category tiles first (pick one), then one list of roomy cards with chips.
//   C  Index    — sticky illustrated jump strip, accent-ruled dense index, full-width names.

import { useState } from "react";
import { ChevronDown, ChevronRight } from "@/components/pulse/icons";

import {
  PATTERN_BLURB,
  PATTERN_LABEL,
  parseMovementPattern,
  type MovementPattern,
} from "@/lib/movement-pattern";
import { usageBadgeText, usageMarker } from "@/lib/exercise-usage-view";
import { plainMuscleSummary } from "@/lib/plain-muscle-summary";
import { equipmentLabel } from "@/lib/equipment";
import type { CatalogTaxonomyGroup } from "@/lib/exercise-taxonomy-types";
import type { ExerciseSearchResult } from "@/lib/exercises-types";
import { EquipmentSymbol } from "@/components/exercise/equipment-symbol";
import { PATTERN_ACCENT, PatternPlate } from "./pattern-plate.prototype";

export interface CatalogVariantProps {
  groups: CatalogTaxonomyGroup[];
  usageMap: Map<number, string>;
  referenceIso: string;
  onOpen: (exercise: ExerciseSearchResult) => void;
}

export const VARIANT_NAMES: Record<string, string> = {
  current: "Current",
  A: "Plates",
  B: "Gallery",
  C: "Index",
};

// Names wrap; an unbroken string breaks anywhere rather than overflowing.
const WRAP = "break-words [overflow-wrap:anywhere]";

function difficultyLabel(difficulty: number | null): string | null {
  if (difficulty === null) return null;
  if (difficulty <= 3) return "Beginner";
  if (difficulty <= 6) return "Intermediate";
  return "Advanced";
}

function kitLabel(equipment: readonly string[]): string {
  const real = equipment.filter((item) => item !== "bodyweight");
  return real.length === 0 ? "Bodyweight" : real.map(equipmentLabel).join(" + ");
}

function Usage({ id, usageMap, referenceIso }: { id: number; usageMap: Map<number, string>; referenceIso: string }) {
  const marker = usageMarker(usageMap.get(id) ?? null, referenceIso);
  const text = usageBadgeText(marker);
  return marker.trained ? (
    <span className="font-sans text-[11px] text-text-muted">{text.toLowerCase()}</span>
  ) : (
    <span className="rounded-full border border-border px-2 py-0.5 font-sans text-[10px] font-semibold text-text-secondary">
      New
    </span>
  );
}

// ─── Variant A: Plates ───────────────────────────────────────────────────────────────

export function VariantA({ groups, usageMap, referenceIso, onOpen }: CatalogVariantProps) {
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <PlateSection key={group.pattern} group={group} usageMap={usageMap} referenceIso={referenceIso} onOpen={onOpen} />
      ))}
    </div>
  );
}

function PlateSection({ group, usageMap, referenceIso, onOpen }: { group: CatalogTaxonomyGroup } & Omit<CatalogVariantProps, "groups">) {
  const [open, setOpen] = useState(true);
  const pattern = parseMovementPattern(group.pattern);
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-4 p-4 text-left"
      >
        <PatternPlate pattern={pattern} className="h-20 w-20" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-baseline gap-2">
            <span className="font-display text-[20px] font-semibold text-balance text-text-primary">
              {PATTERN_LABEL[pattern]}
            </span>
            <span className="font-sans text-[12px] text-text-muted">{group.count} exercises</span>
          </span>
          <span className="font-sans text-[13px] leading-snug text-text-secondary">
            {PATTERN_BLURB[pattern]}
          </span>
        </span>
        {open ? (
          <ChevronDown className="h-5 w-5 shrink-0 text-text-muted" aria-hidden />
        ) : (
          <ChevronRight className="h-5 w-5 shrink-0 text-text-muted" aria-hidden />
        )}
      </button>
      {open ? (
        <ul className="border-t border-border">
          {group.exercises.map((exercise) => (
            <li key={exercise.id}>
              <button
                type="button"
                onClick={() => onOpen(exercise)}
                className="flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-elevated/40"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className={`font-sans text-[15px] font-medium leading-snug text-text-primary ${WRAP}`}>
                    {exercise.name}
                  </span>
                  {exercise.targeted_muscles.length > 0 ? (
                    <span className="font-sans text-[12px] leading-snug text-text-secondary">
                      {plainMuscleSummary(exercise.targeted_muscles)}
                    </span>
                  ) : null}
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                    <EquipmentSymbol equipment={exercise.equipment} showOverflowCount />
                    <Usage id={exercise.id} usageMap={usageMap} referenceIso={referenceIso} />
                  </span>
                </span>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-text-muted" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

// ─── Variant B: Gallery ──────────────────────────────────────────────────────────────

export function VariantB({ groups, usageMap, referenceIso, onOpen }: CatalogVariantProps) {
  const [picked, setPicked] = useState<MovementPattern | "all">("all");
  const shown = picked === "all" ? groups : groups.filter((g) => parseMovementPattern(g.pattern) === picked);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {groups.map((group) => {
          const pattern = parseMovementPattern(group.pattern);
          const active = picked === pattern;
          return (
            <button
              key={group.pattern}
              type="button"
              aria-pressed={active}
              onClick={() => setPicked(active ? "all" : pattern)}
              className={
                "flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors " +
                (active ? "border-text-primary bg-elevated" : "border-border bg-surface hover:border-text-muted")
              }
            >
              <PatternPlate pattern={pattern} className="aspect-square w-full max-w-[112px]" />
              <span className="font-display text-[15px] font-semibold text-text-primary">{PATTERN_LABEL[pattern]}</span>
              <span className="font-sans text-[11px] text-text-muted">{group.count} exercises</span>
            </button>
          );
        })}
      </div>

      {shown.map((group) => {
        const pattern = parseMovementPattern(group.pattern);
        return (
          <section key={group.pattern} className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 font-display text-[17px] font-semibold text-text-primary">
              <span className={`h-3 w-3 rounded-full ${PATTERN_ACCENT[pattern].bar}`} aria-hidden />
              {PATTERN_LABEL[pattern]}
            </h3>
            <ul className="flex flex-col gap-2">
              {group.exercises.map((exercise) => {
                const level = difficultyLabel(exercise.difficulty);
                return (
                  <li key={exercise.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(exercise)}
                      className="flex w-full flex-col gap-2 rounded-xl border border-border bg-surface p-3.5 text-left transition-colors hover:border-text-muted"
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className={`font-display text-[16px] font-semibold leading-snug text-text-primary ${WRAP}`}>
                          {exercise.name}
                        </span>
                        <Usage id={exercise.id} usageMap={usageMap} referenceIso={referenceIso} />
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        {exercise.targeted_muscles.slice(0, 3).map((muscle) => (
                          <span key={muscle} className="rounded-full bg-elevated px-2.5 py-0.5 font-sans text-[12px] capitalize text-text-secondary">
                            {muscle}
                          </span>
                        ))}
                        <span className="rounded-full border border-border px-2.5 py-0.5 font-sans text-[12px] text-text-secondary">
                          {kitLabel(exercise.equipment)}
                        </span>
                        {level ? (
                          <span className="rounded-full border border-border px-2.5 py-0.5 font-sans text-[12px] text-text-secondary">
                            {level}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// ─── Variant C: Index ────────────────────────────────────────────────────────────────

export function VariantC({ groups, usageMap, referenceIso, onOpen }: CatalogVariantProps) {
  return (
    <div className="flex flex-col gap-6">
      <nav
        aria-label="Jump to a movement pattern"
        className="sticky top-14 z-20 -mx-6 flex gap-2 overflow-x-auto border-b border-border bg-base px-6 py-2.5"
      >
        {groups.map((group) => {
          const pattern = parseMovementPattern(group.pattern);
          return (
            <a
              key={group.pattern}
              href={`#pattern-${pattern}`}
              className="flex shrink-0 flex-col items-center gap-1 rounded-lg px-1.5 py-1 hover:bg-elevated"
            >
              <PatternPlate pattern={pattern} className="h-12 w-12" />
              <span className="font-sans text-[11px] font-medium text-text-secondary">{PATTERN_LABEL[pattern]}</span>
            </a>
          );
        })}
      </nav>

      {groups.map((group) => {
        const pattern = parseMovementPattern(group.pattern);
        const accent = PATTERN_ACCENT[pattern];
        return (
          <section key={group.pattern} id={`pattern-${pattern}`} className="scroll-mt-40">
            <header className="mb-1 flex items-end gap-3 border-b-2 border-border pb-2">
              <PatternPlate pattern={pattern} plate={false} className={`h-10 w-10 shrink-0`} />
              <span className="flex min-w-0 flex-col">
                <span className="font-display text-[22px] font-bold leading-none text-text-primary">
                  {PATTERN_LABEL[pattern]}
                </span>
                <span className="pt-1 font-sans text-[12px] text-text-muted">
                  {group.count} · {PATTERN_BLURB[pattern]}
                </span>
              </span>
            </header>
            <ol>
              {group.exercises.map((exercise) => {
                const level = difficultyLabel(exercise.difficulty);
                const muscles = exercise.targeted_muscles.slice(0, 3).join(", ");
                return (
                  <li key={exercise.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(exercise)}
                      className="group flex w-full gap-3 border-b border-border py-2.5 text-left"
                    >
                      <span className={`w-1 shrink-0 rounded-full ${accent.bar}`} aria-hidden />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className={`font-sans text-[15px] font-semibold leading-snug text-text-primary group-hover:underline ${WRAP}`}>
                          {exercise.name}
                        </span>
                        <span className="font-sans text-[12px] capitalize leading-snug text-text-secondary">
                          {[muscles, kitLabel(exercise.equipment), level].filter(Boolean).join("  ·  ")}
                        </span>
                      </span>
                      <span className="shrink-0 pt-0.5">
                        <Usage id={exercise.id} usageMap={usageMap} referenceIso={referenceIso} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
