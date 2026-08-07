"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Link2, Trash2, Unlink } from "lucide-react";

import {
  resolveAuthoredExercise,
  submitAuthorSession,
} from "@/app/sessions/log/actions";
import {
  authoredSupersetLayout,
  buildAuthorSessionRequest,
  groupExerciseWithNext,
  reorderExercise,
  setExerciseRoundRest,
  ungroupExercise,
  wholeNonNegative,
  type AuthorSessionFields,
  type AuthoredExerciseFields,
  type SupersetSlot,
} from "@/lib/hand-authored-session";
import { dissolveSingletonGroups } from "@/lib/supersets";
import { LOAD_KIND_OPTIONS } from "@/lib/load";
import type { PickedExercise } from "@/lib/protocol-builder";
import { TRAINING_TYPES } from "@/lib/sessions-types";
import { ExerciseLibrary } from "@/components/ExerciseLibrary";
import { Field } from "@/components/pulse/field";
import { Alert } from "@/components/pulse/alert";
import { SectionHeader } from "@/components/pulse/section-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface HandAuthoredSessionFormProps {
  today: string;
}

// One performed set the user is recording under an exercise, with a stable key so React
// can track rows across add/remove without re-keying the array.
interface PerformedSetRow {
  key: number;
  reps: string;
  loadKind: string;
  loadValue: string;
  perceivedDifficulty: string;
}

// One exercise in the draft: the picked catalog Exercise, its authored plan, its Superset
// overlay, and the sets performed. Held in component state and mapped to the payload by the
// pure `buildAuthorSessionRequest` view-model on submit. `supersetGroup`/`roundRestSeconds`
// are the two structural fields the shared `supersets` operations read and write.
interface ExerciseRow {
  key: number;
  exerciseId: number;
  exerciseName: string;
  sets: string;
  reps: string;
  restSeconds: string;
  tempo: string;
  loadKind: string;
  loadValue: string;
  supersetGroup: string | null;
  roundRestSeconds: number | null;
  performedSets: PerformedSetRow[];
}

const DEFAULT_LOAD_KIND = "absolute";
const DEFAULT_TRAINING_TYPE = "strength";

let nextKey = 0;
function makeKey(): number {
  nextKey += 1;
  return nextKey;
}

function makePerformedSet(): PerformedSetRow {
  return {
    key: makeKey(),
    reps: "",
    loadKind: DEFAULT_LOAD_KIND,
    loadValue: "",
    perceivedDifficulty: "",
  };
}

function makeExerciseRow(exercise: PickedExercise): ExerciseRow {
  return {
    key: makeKey(),
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    sets: "3",
    reps: "",
    restSeconds: "",
    tempo: "",
    loadKind: DEFAULT_LOAD_KIND,
    loadValue: "",
    supersetGroup: null,
    roundRestSeconds: null,
    performedSets: [makePerformedSet()],
  };
}

// A contiguous run of exercises to render together: a bordered Superset container wrapping
// its members, or a single solo exercise. Derived from the per-row Superset layout so the
// render brackets each group into one visible box (ADR-0023).
type RenderRun =
  | { kind: "solo"; index: number }
  | { kind: "group"; group: string; indices: number[] };

function renderRuns(layout: SupersetSlot[]): RenderRun[] {
  const runs: RenderRun[] = [];
  let index = 0;
  while (index < layout.length) {
    const slot = layout[index];
    if (slot.group === null) {
      runs.push({ kind: "solo", index });
      index += 1;
      continue;
    }
    // Consume the whole contiguous group run (contiguity is an enforced invariant, so a
    // group's members always sit together).
    const indices: number[] = [];
    const group = slot.group;
    while (index < layout.length && layout[index].group === group) {
      indices.push(index);
      index += 1;
    }
    runs.push({ kind: "group", group, indices });
  }
  return runs;
}

// The build-and-log screen for a Hand-Authored Session (ADR-0040): assemble a workout
// from catalog exercises (sets/reps/rest/tempo/typed Load) and record what was actually
// performed, then submit once to create the plan and its first Logged Session together.
// The picker is search-and-create (ADR-0033, issue #288): a movement the catalog lacks is
// minted as a `user_entered` Exercise on confirmation and added like a catalog pick.
// Consecutive exercises can be grouped into a Superset with a round-rest (ADR-0023, issue
// #289), reusing the shared `supersets` vocabulary — grouping rides on the authored plan
// while the record stays sets-only.
export function HandAuthoredSessionForm({ today }: HandAuthoredSessionFormProps) {
  const [exercises, setExercises] = useState<ExerciseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const addExercise = (exercise: PickedExercise) =>
    setExercises((current) => [...current, makeExerciseRow(exercise)]);

  // Resolve a typed movement to a catalog Exercise (minting a `user_entered` one on a
  // miss) and add it to the workout. The pure picker view-model has already decided the
  // name is worth offering; this runs the create and folds the result in. The action
  // returns a user-safe error whenever it yields no exercise, so it is surfaced verbatim
  // for the picker to show.
  const createExercise = async (name: string): Promise<{ error: string | null }> => {
    const outcome = await resolveAuthoredExercise(name);
    if (outcome.exercise) addExercise(outcome.exercise);
    return { error: outcome.error };
  };

  // Removing a member can leave a Superset with a single member, which is not a valid
  // group (ADR-0023); dissolve any such leftover so the draft never renders — or submits —
  // a broken one-member "superset".
  const removeExercise = (key: number) =>
    setExercises((current) =>
      dissolveSingletonGroups(current.filter((row) => row.key !== key)),
    );

  const updateExercise = (key: number, patch: Partial<ExerciseRow>) =>
    setExercises((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );

  // Superset editing reuses the shared structural operations (ADR-0023): grouping,
  // ungrouping, round-rest, and a contiguity-preserving reorder — all keyed by list
  // position, so they stay aligned to the rendered order.
  const handleGroupWithNext = (index: number) =>
    setExercises((current) => groupExerciseWithNext(current, index));

  const ungroupAt = (index: number) =>
    setExercises((current) => ungroupExercise(current, index));

  const setRoundRest = (index: number, roundRestSeconds: number | null) =>
    setExercises((current) =>
      setExerciseRoundRest(current, index, roundRestSeconds),
    );

  const moveExercise = (from: number, to: number) =>
    setExercises((current) => reorderExercise(current, from, to));

  // Whether moving `from` → `to` actually reorders: `reorderExercise` returns the input
  // unchanged when a move would split a Superset (or is a no-op), so an identity result
  // means the move is illegal. Used to disable a move control rather than let it dead-click.
  const canMove = (from: number, to: number) =>
    reorderExercise(exercises, from, to) !== exercises;

  const addPerformedSet = (key: number) =>
    setExercises((current) =>
      current.map((row) =>
        row.key === key
          ? { ...row, performedSets: [...row.performedSets, makePerformedSet()] }
          : row,
      ),
    );

  const updatePerformedSet = (
    exerciseKey: number,
    setKey: number,
    patch: Partial<PerformedSetRow>,
  ) =>
    setExercises((current) =>
      current.map((row) =>
        row.key === exerciseKey
          ? {
              ...row,
              performedSets: row.performedSets.map((set) =>
                set.key === setKey ? { ...set, ...patch } : set,
              ),
            }
          : row,
      ),
    );

  const removePerformedSet = (exerciseKey: number, setKey: number) =>
    setExercises((current) =>
      current.map((row) =>
        row.key === exerciseKey
          ? {
              ...row,
              performedSets:
                row.performedSets.length === 1
                  ? row.performedSets
                  : row.performedSets.filter((set) => set.key !== setKey),
            }
          : row,
      ),
    );

  const submit = (formData: FormData) => {
    const fields: AuthorSessionFields = {
      performedOn: String(formData.get("performed_on") ?? ""),
      trainingType: String(formData.get("training_type") ?? ""),
      exercises: exercises.map(
        (row): AuthoredExerciseFields => ({
          exerciseId: row.exerciseId,
          sets: row.sets,
          reps: row.reps,
          restSeconds: row.restSeconds,
          tempo: row.tempo,
          loadKind: row.loadKind,
          loadValue: row.loadValue,
          supersetGroup: row.supersetGroup,
          roundRestSeconds: row.roundRestSeconds,
          performedSets: row.performedSets.map((set) => ({
            reps: set.reps,
            loadKind: set.loadKind,
            loadValue: set.loadValue,
            perceivedDifficulty: set.perceivedDifficulty,
          })),
        }),
      ),
    };

    const result = buildAuthorSessionRequest(fields, today);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    startTransition(async () => {
      const outcome = await submitAuthorSession(result.request);
      // A successful submit redirects server-side; only a failure returns here.
      if (outcome?.error) setError(outcome.error);
    });
  };

  const layout = authoredSupersetLayout(exercises);
  const runs = renderRuns(layout);

  return (
    <form action={submit} className="flex flex-col gap-6">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Field label="Date performed">
        <Input
          name="performed_on"
          type="date"
          defaultValue={today}
          max={today}
          required
        />
      </Field>

      <Field label="Training type">
        <Select name="training_type" defaultValue={DEFAULT_TRAINING_TYPE}>
          {TRAINING_TYPES.map((trainingType) => (
            <option key={trainingType} value={trainingType}>
              {trainingType}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset className="flex flex-col gap-4 border-0 p-0">
        <SectionHeader>EXERCISES</SectionHeader>

        {exercises.length === 0 ? (
          <p className="font-mono text-[12px] text-text-muted">
            Search the catalog below to add the movements you trained.
          </p>
        ) : null}

        {runs.map((run) => {
          if (run.kind === "solo") {
            const index = run.index;
            const row = exercises[index];
            return (
              <ExerciseCard
                key={row.key}
                row={row}
                slot={layout[index]}
                canMoveUp={index > 0 && canMove(index, index - 1)}
                canMoveDown={index < exercises.length - 1 && canMove(index, index + 1)}
                onRemove={() => removeExercise(row.key)}
                onChange={(patch) => updateExercise(row.key, patch)}
                onAddSet={() => addPerformedSet(row.key)}
                onChangeSet={(setKey, patch) =>
                  updatePerformedSet(row.key, setKey, patch)
                }
                onRemoveSet={(setKey) => removePerformedSet(row.key, setKey)}
                onGroupWithNext={() => handleGroupWithNext(index)}
                onMoveUp={() => moveExercise(index, index - 1)}
                onMoveDown={() => moveExercise(index, index + 1)}
              />
            );
          }

          const opener = run.indices[0];
          const closer = run.indices[run.indices.length - 1];
          return (
            <SupersetContainer
              key={`superset-${run.group}`}
              roundRestSeconds={exercises[closer].roundRestSeconds}
              onChangeRoundRest={(value) => setRoundRest(opener, value)}
              onUngroup={() => ungroupAt(opener)}
            >
              {run.indices.map((index) => {
                const row = exercises[index];
                return (
                  <ExerciseCard
                    key={row.key}
                    row={row}
                    slot={layout[index]}
                    canMoveUp={index > 0 && canMove(index, index - 1)}
                    canMoveDown={index < exercises.length - 1 && canMove(index, index + 1)}
                    onRemove={() => removeExercise(row.key)}
                    onChange={(patch) => updateExercise(row.key, patch)}
                    onAddSet={() => addPerformedSet(row.key)}
                    onChangeSet={(setKey, patch) =>
                      updatePerformedSet(row.key, setKey, patch)
                    }
                    onRemoveSet={(setKey) => removePerformedSet(row.key, setKey)}
                    onGroupWithNext={() => handleGroupWithNext(index)}
                    onMoveUp={() => moveExercise(index, index - 1)}
                    onMoveDown={() => moveExercise(index, index + 1)}
                  />
                );
              })}
            </SupersetContainer>
          );
        })}

        <ExerciseLibrary onPick={addExercise} onCreate={createExercise} />
      </fieldset>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Save workout"}
      </Button>
    </form>
  );
}

// The bordered container that brackets a Superset's members into one visible group, with
// the group-owned round-rest and an ungroup control (ADR-0023). The round-rest belongs to
// the group, not any one member, so it lives here once — never on the individual rows.
function SupersetContainer({
  roundRestSeconds,
  onChangeRoundRest,
  onUngroup,
  children,
}: {
  roundRestSeconds: number | null;
  onChangeRoundRest: (value: number | null) => void;
  onUngroup: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-cyan/40 bg-cyan/[0.03] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="label-mono text-[10px] text-cyan">SUPERSET</span>
        <Button
          type="button"
          variant="ghost"
          onClick={onUngroup}
          aria-label="Ungroup superset"
        >
          <Unlink className="h-4 w-4" />
          Ungroup
        </Button>
      </div>

      {children}

      <label className="flex flex-col gap-1.5">
        <span className="label-mono text-[9px] text-text-muted">
          Round rest (sec)
        </span>
        <Input
          type="number"
          min={0}
          value={roundRestSeconds === null ? "" : String(roundRestSeconds)}
          placeholder="120"
          onChange={(event) => {
            const raw = event.target.value.trim();
            const parsed = raw === "" ? null : Number(raw);
            onChangeRoundRest(
              parsed !== null && Number.isInteger(parsed) && parsed >= 0
                ? parsed
                : null,
            );
          }}
          aria-label="Round rest seconds for this superset"
        />
      </label>
    </div>
  );
}

interface ExerciseCardProps {
  row: ExerciseRow;
  slot: SupersetSlot;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRemove: () => void;
  onChange: (patch: Partial<ExerciseRow>) => void;
  onAddSet: () => void;
  onChangeSet: (setKey: number, patch: Partial<PerformedSetRow>) => void;
  onRemoveSet: (setKey: number) => void;
  onGroupWithNext: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function ExerciseCard({
  row,
  slot,
  canMoveUp,
  canMoveDown,
  onRemove,
  onChange,
  onAddSet,
  onChangeSet,
  onRemoveSet,
  onGroupWithNext,
  onMoveUp,
  onMoveDown,
}: ExerciseCardProps) {
  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {slot.memberLabel ? (
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-cyan/15 font-mono text-[11px] font-bold text-cyan"
              aria-label={`Superset member ${slot.memberLabel}`}
            >
              {slot.memberLabel}
            </span>
          ) : null}
          <h3 className="font-display text-base font-bold text-text-primary">
            {row.exerciseName}
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            aria-label={`Move ${row.exerciseName} up`}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            aria-label={`Move ${row.exerciseName} down`}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onRemove}
            aria-label={`Remove ${row.exerciseName}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* The authored plan: sets/reps/rest/tempo and a typed Load (ADR-0010). */}
      <div className="grid grid-cols-2 gap-2.5">
        <FieldLabel label="Sets">
          <Input
            type="number"
            min={1}
            value={row.sets}
            onChange={(event) => onChange({ sets: event.target.value })}
            aria-label={`Sets for ${row.exerciseName}`}
          />
        </FieldLabel>
        <FieldLabel label="Reps">
          <Input
            value={row.reps}
            placeholder="8-12"
            onChange={(event) => onChange({ reps: event.target.value })}
            aria-label={`Reps for ${row.exerciseName}`}
          />
        </FieldLabel>
        {/* A grouped member rests once per round at the group level, so its own rest is
            dormant while grouped — hidden here and restored on ungroup (ADR-0023). */}
        {slot.group === null ? (
          <FieldLabel label="Rest (sec)">
            <Input
              type="number"
              min={0}
              value={row.restSeconds}
              placeholder="90"
              onChange={(event) => onChange({ restSeconds: event.target.value })}
              aria-label={`Rest seconds for ${row.exerciseName}`}
            />
          </FieldLabel>
        ) : null}
        <FieldLabel label="Tempo">
          <Input
            value={row.tempo}
            placeholder="3-1-1"
            onChange={(event) => onChange({ tempo: event.target.value })}
            aria-label={`Tempo for ${row.exerciseName}`}
          />
        </FieldLabel>
        <FieldLabel label="Load kind">
          <Select
            value={row.loadKind}
            onChange={(event) => onChange({ loadKind: event.target.value })}
            aria-label={`Load kind for ${row.exerciseName}`}
          >
            {LOAD_KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FieldLabel>
        <FieldLabel label="Load">
          <Input
            value={row.loadValue}
            placeholder="60 kg"
            onChange={(event) => onChange({ loadValue: event.target.value })}
            aria-label={`Load for ${row.exerciseName}`}
          />
        </FieldLabel>
      </div>

      {/* The record: what was actually performed, set by set. */}
      <div className="flex flex-col gap-2.5">
        <SectionHeader>SETS PERFORMED</SectionHeader>
        {row.performedSets.map((set, index) => (
          <div
            key={set.key}
            className="grid grid-cols-[1fr_1.5fr_4rem_auto] items-end gap-2"
          >
            <FieldLabel label={`Set ${index + 1} reps`}>
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
            <FieldLabel label="Load">
              <Input
                value={set.loadValue}
                placeholder="60 kg"
                onChange={(event) =>
                  onChangeSet(set.key, { loadValue: event.target.value })
                }
                aria-label={`Set ${index + 1} load for ${row.exerciseName}`}
              />
            </FieldLabel>
            <FieldLabel label="RPE">
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
                type="button"
                variant="ghost"
                onClick={() => onRemoveSet(set.key)}
                aria-label={`Remove set ${index + 1} for ${row.exerciseName}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : (
              <span aria-hidden />
            )}
          </div>
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

      {/* Group this exercise with the next into a Superset (ADR-0023). Shown only when a
          next exercise exists to group with, and it is not already the same group. */}
      {slot.canGroupWithNext ? (
        <Button
          type="button"
          variant="secondary"
          onClick={onGroupWithNext}
          className="w-full"
          aria-label={`Group ${row.exerciseName} with the next exercise into a superset`}
        >
          <Link2 className="h-4 w-4" />
          Group with next
        </Button>
      ) : null}
    </Card>
  );
}

// A compact inline label wrapper for the grid fields; the pulse `Field` renders a fuller
// block, so this keeps the dense sets/reps grid tight.
function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label-mono text-[9px] text-text-muted">{label}</span>
      {children}
    </label>
  );
}
