"use client";

import { memo } from "react";

import {
  PATTERN_ACCENT,
  PATTERN_BLURB,
  PATTERN_LABEL,
  parseMovementPattern,
} from "@/lib/movement-pattern";
import { catalogEntryFacts, patternAnchorId } from "@/lib/catalog-entry-view";
import {
  usageBadgeText,
  usageMarker,
  type UsageMarker,
} from "@/lib/exercise-usage-view";
import type { ExerciseSearchResult } from "@/lib/exercises-types";
import { Badge } from "@/components/ui/badge";
import { MovementGlyph } from "@/components/exercise/movement-glyph";

// One Movement Pattern section of the field-guide index (ADR-0072), lifted out of
// `ExerciseCatalogTaxonomy` so the memo boundary it needs is a property of a module rather
// than a local function the screen re-declares.
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

// Its pictogram, label, count, and blurb over the exercises that classify into it. Always
// open: the jump strip above the index is how a reader skips a family, and the anchor id
// it targets lives here.
function PatternSectionBody({
  pattern,
  count,
  exercises,
  usageMap,
  referenceIso,
  onOpen,
}: PatternSectionProps): React.JSX.Element {
  const resolved = parseMovementPattern(pattern);
  const rule = PATTERN_ACCENT[resolved].rule;

  return (
    <section id={patternAnchorId(resolved)} className="scroll-mt-44">
      <div className="flex items-end gap-3 border-b-2 border-border pb-2">
        <MovementGlyph pattern={resolved} className="h-10 w-10 shrink-0 text-text-primary" />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-display text-[22px] font-bold leading-none text-balance text-text-primary">
            {PATTERN_LABEL[resolved]}
          </h2>
          <p className="font-sans text-[12px] leading-snug text-text-muted">
            {count} · {PATTERN_BLURB[resolved]}
          </p>
        </div>
      </div>

      <ul>
        {exercises.map((exercise) => (
          <li key={exercise.id}>
            <IndexRow
              exercise={exercise}
              rule={rule}
              lastPerformedOn={usageMap.get(exercise.id) ?? null}
              referenceIso={referenceIso}
              onOpen={onOpen}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export const PatternSection = memo(PatternSectionBody);

interface IndexRowProps {
  exercise: ExerciseSearchResult;
  rule: string;
  lastPerformedOn: string | null;
  referenceIso: string;
  onOpen: (exercise: ExerciseSearchResult) => void;
}

// One catalog entry: the full name (it wraps, never truncates — ADR-0085), then one plain
// facts line. The accent rule ties it to its family when the section header has scrolled
// away. Memoized for the same reason the section is.
function IndexRowBody({
  exercise,
  rule,
  lastPerformedOn,
  referenceIso,
  onOpen,
}: IndexRowProps): React.JSX.Element {
  const marker = usageMarker(lastPerformedOn, referenceIso);

  return (
    <button
      type="button"
      onClick={() => onOpen(exercise)}
      className="group flex w-full gap-3 border-b border-border py-2.5 text-left"
    >
      <span className={`w-1 shrink-0 rounded-full ${rule}`} aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="break-words font-sans text-[15px] font-semibold leading-snug text-text-primary [overflow-wrap:anywhere] group-hover:underline">
          {exercise.name}
        </span>
        <span className="font-sans text-[12px] leading-snug text-text-secondary">
          {catalogEntryFacts(exercise)}
        </span>
      </span>
      <span className="shrink-0 pt-0.5">
        <UsageBadge marker={marker} />
      </span>
    </button>
  );
}

const IndexRow = memo(IndexRowBody);

// The strictly descriptive usage marker (ADR-0042): NEW when never trained, else a neutral
// "TRAINED · <recency>". Preserved from the flat browse so the redesign loses none of its
// signal. No call to action, no "overdue" styling.
function UsageBadge({ marker }: { marker: UsageMarker }): React.JSX.Element {
  const text = usageBadgeText(marker);
  if (!marker.trained) {
    return <Badge variant="outline">{text}</Badge>;
  }
  // Sentence case in the sans face: the 9px mono caps it replaces were hard to read.
  const sentence = text.charAt(0) + text.slice(1).toLowerCase();
  return <span className="font-sans text-[11px] text-text-muted">{sentence}</span>;
}
