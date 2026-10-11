"use client";

import { Trash2 } from "@/components/pulse/icons";

import type { LoggedExerciseRow, PerformedSetRow } from "@/lib/hand-authored-draft";
import type { WeightUnit } from "@/lib/weight-unit";
import { FieldGroup, FieldLabel } from "@/components/pulse/field";
import { FieldRow, FIELD_WIDTH } from "@/components/pulse/field-row";
import { LoadValueInput } from "@/components/pulse/load-value-input";
import { SectionHeader } from "@/components/pulse/section-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface PerformedSetsEditorProps {
  row: LoggedExerciseRow;
  unit: WeightUnit;
  onAddSet: () => void;
  onChangeSet: (setKey: number, patch: Partial<Omit<PerformedSetRow, "key">>) => void;
  onRemoveSet: (setKey: number) => void;
}

// The record half of a Log form exercise card: what was actually performed, set by set (audit
// C-1). The inputs' shape follows the exercise's Amount kind (ADR-0032): a distance set takes a
// value plus a companion time, a duration set a single hold time, a rep set a count.
export function PerformedSetsEditor({
  row,
  unit,
  onAddSet,
  onChangeSet,
  onRemoveSet,
}: PerformedSetsEditorProps) {
  const isDuration = row.kind === "duration";
  const isDistance = row.kind === "distance";
  return (
    <div className="flex flex-col gap-2.5">
      <SectionHeader>SETS PERFORMED</SectionHeader>
      {row.performedSets.map((set, index) => (
        <FieldRow key={set.key} className="items-end gap-2">
          {isDistance ? (
            <FieldGroup
              className={FIELD_WIDTH}
              label={`Set ${index + 1} distance (${row.unit})`}
            >
              {/* Distance value plus an optional companion time; a time makes pace a
                  derivable read (ADR-0032, issue #301). */}
              <FieldRow className="gap-1.5">
                <Input
                  className={FIELD_WIDTH}
                  type="number"
                  min={0}
                  step="any"
                  value={set.distance}
                  placeholder="5"
                  onChange={(event) =>
                    onChangeSet(set.key, { distance: event.target.value })
                  }
                  aria-label={`Set ${index + 1} distance for ${row.exerciseName}`}
                />
                <Input
                  spellCheck={false}
                  className={FIELD_WIDTH}
                  value={set.duration}
                  placeholder="mm:ss"
                  onChange={(event) =>
                    onChangeSet(set.key, { duration: event.target.value })
                  }
                  aria-label={`Set ${index + 1} time for ${row.exerciseName}`}
                />
              </FieldRow>
            </FieldGroup>
          ) : isDuration ? (
            <FieldLabel className={FIELD_WIDTH} label={`Set ${index + 1} hold`}>
              <Input
                spellCheck={false}
                value={set.duration}
                placeholder="0:45"
                onChange={(event) =>
                  onChangeSet(set.key, { duration: event.target.value })
                }
                aria-label={`Set ${index + 1} hold time for ${row.exerciseName}`}
              />
            </FieldLabel>
          ) : (
            <FieldLabel className={FIELD_WIDTH} label={`Set ${index + 1} reps`}>
              <Input
                type="number"
                min={0}
                value={set.reps}
                onChange={(event) =>
                  onChangeSet(set.key, { reps: event.target.value })
                }
                aria-label={`Set ${index + 1} reps for ${row.exerciseName}`}
              />
            </FieldLabel>
          )}
          <FieldLabel className={FIELD_WIDTH} label="Load">
            <LoadValueInput
              kind={set.loadKind}
              unit={unit}
              value={set.loadValue}
              onChange={(event) =>
                onChangeSet(set.key, { loadValue: event.target.value })
              }
              aria-label={`Set ${index + 1} load for ${row.exerciseName}`}
            />
          </FieldLabel>
          <FieldLabel className={FIELD_WIDTH} label="RPE">
            <Input
              type="number"
              min={1}
              max={10}
              value={set.perceivedDifficulty}
              onChange={(event) =>
                onChangeSet(set.key, {
                  perceivedDifficulty: event.target.value,
                })
              }
              aria-label={`Set ${index + 1} perceived difficulty for ${row.exerciseName}`}
            />
          </FieldLabel>
          {row.performedSets.length > 1 ? (
            <Button
              className="shrink-0"
              type="button"
              variant="ghost"
              onClick={() => onRemoveSet(set.key)}
              aria-label={`Remove set ${index + 1} for ${row.exerciseName}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </FieldRow>
      ))}
      <Button
        type="button"
        variant="secondary"
        onClick={onAddSet}
        className="w-full"
      >
        + Add a performed set
      </Button>
    </div>
  );
}
