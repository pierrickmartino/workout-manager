"use client";

import { memo, useState } from "react";
import { ChevronDown, ChevronRight } from "@/components/pulse/icons";

import {
  PATTERN_BLURB,
  PATTERN_LABEL,
  parseMovementPattern,
} from "@/lib/movement-pattern";
import {
  usageBadgeText,
  usageMarker,
  type UsageMarker,
} from "@/lib/exercise-usage-view";
import type { ExerciseSearchResult } from "@/lib/exercises-types";
import { Badge } from "@/components/ui/badge";
import { MovementGlyph } from "@/components/exercise/movement-glyph";
import { EquipmentSymbol } from "@/components/exercise/equipment-symbol";

// One collapsible Movement Pattern section of the field-guide taxonomy (ADR-0072), lifted
// out of `ExerciseCatalogTaxonomy` so the memo boundary it needs is a property of a module
// rather than a local function the screen re-declares.
//
// Why memoized: the catalog is the one unpaged list in the app, and this section maps its
// own exercises, so a screen re-render that changes nothing about the catalog — opening the
// details drawer, a connectivity blip — otherwise walks every row of the whole filtered
// set. ADR-0091's pairing rule applies: the boundary is only worth anything because the
// screen hands it a `useCallback`'d `onOpen` and the `useMemo`'d usage map, and
// `lib/catalog-list-memo.test.ts` holds both halves together.

interface PatternSectionProps {
  pattern: string;
  count: number;
  exercises: ExerciseSearchResult[];
  usageMap: Map<number, string>;
  referenceIso: string;
  onOpen: (exercise: ExerciseSearchResult) => void;
}

// Its family plate, label, count, and blurb over a list of the exercises that classify into
// it. Starts open so the whole catalog is scannable; the header toggles it shut.
function PatternSectionBody({
  pattern,
  count,
  exercises,
  usageMap,
  referenceIso,
  onOpen,
}: PatternSectionProps): React.JSX.Element {
  const [open, setOpen] = useState(true);
  const resolved = parseMovementPattern(pattern);

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-elevated/50"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-base text-cyan">
          <MovementGlyph pattern={resolved} className="h-7 w-7" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2">
            <span className="font-display text-[15px] font-semibold text-text-primary">
              {PATTERN_LABEL[resolved]}
            </span>
            <span className="label-mono text-[9px] text-text-muted">{count}</span>
          </span>
          <span className="truncate font-sans text-[11px] text-text-muted">
            {PATTERN_BLURB[resolved]}
          </span>
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
        )}
      </button>

      {open ? (
        <ul className="border-t border-border">
          {exercises.map((exercise) => (
            <li key={exercise.id}>
              <TaxonomyRow
                exercise={exercise}
                lastPerformedOn={usageMap.get(exercise.id) ?? null}
                referenceIso={referenceIso}
                onOpen={onOpen}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export const PatternSection = memo(PatternSectionBody);

interface TaxonomyRowProps {
  exercise: ExerciseSearchResult;
  lastPerformedOn: string | null;
  referenceIso: string;
  onOpen: (exercise: ExerciseSearchResult) => void;
}

// One catalog entry. Memoized for the same reason the section is: a section that does
// re-render (it was collapsed or expanded) re-renders only the rows whose own props moved.
function TaxonomyRowBody({
  exercise,
  lastPerformedOn,
  referenceIso,
  onOpen,
}: TaxonomyRowProps): React.JSX.Element {
  const pattern = parseMovementPattern(exercise.movement_pattern);
  const marker = usageMarker(lastPerformedOn, referenceIso);

  return (
    <button
      type="button"
      onClick={() => onOpen(exercise)}
      className="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-elevated/40"
    >
      <MovementGlyph
        pattern={pattern}
        className="h-5 w-5 shrink-0 text-text-muted"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="truncate font-sans text-[13px] text-text-primary">
            {exercise.name}
          </span>
          <UsageBadge marker={marker} />
        </span>
      </span>
      <EquipmentSymbol equipment={exercise.equipment} />
      <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
    </button>
  );
}

const TaxonomyRow = memo(TaxonomyRowBody);

// The strictly descriptive usage marker (ADR-0042): NEW when never trained, else a neutral
// "TRAINED · <recency>". Preserved from the flat browse so the redesign loses none of its
// signal. No call to action, no "overdue" styling.
function UsageBadge({ marker }: { marker: UsageMarker }): React.JSX.Element {
  const text = usageBadgeText(marker);
  if (!marker.trained) {
    return <Badge variant="outline">{text}</Badge>;
  }
  return <span className="label-mono text-[9px] text-text-muted">{text}</span>;
}
