"use client";

import { useCallback, useState } from "react";

import { resolveAuthoredExercise } from "@/app/sessions/log/actions";
import {
  highestDraftKey,
  reserveKeysThrough,
  type PlanExerciseRow,
} from "@/lib/hand-authored-draft";
import {
  authoredSupersetLayout,
  groupExerciseWithNext,
  reorderExercise,
  setExerciseRoundRest,
  suppressAuthoredSupersets,
  ungroupExercise,
  type SupersetSlot,
} from "@/lib/hand-authored-session";
import type { PickedExercise } from "@/lib/protocol-builder";
import { dissolveSingletonGroups, remapSelectionAfterReorder } from "@/lib/supersets";
import { useNavigationGuard } from "@/components/NavigationGuardProvider";

interface UseHandAuthoredExercisesOptions<T extends PlanExerciseRow> {
  // The rows the form opens with: none for a blank draft, the folded record for Capture.
  initialRows: () => T[];
  initialTrainingType: string;
  // How a picked Exercise becomes a row of this form's shape (a plan row, or a logged row
  // with its first performed set).
  makeRow: (exercise: PickedExercise) => T;
  // Whether the user carries a Sensitive Constraint (ADR-0023, issue #290): Supersets are
  // paused, so the list the form renders and submits is flattened.
  hasSensitiveConstraint: boolean;
}

export interface HandAuthoredExercises<T extends PlanExerciseRow> {
  // The rows as held, and as rendered and submitted. They differ only for a Sensitive-Constraint
  // user, whose grouping is unlinked (staged, not committed) in `effectiveExercises`.
  exercises: T[];
  effectiveExercises: T[];
  layout: SupersetSlot[];
  trainingType: string;
  setTrainingType: (trainingType: string) => void;
  isDirty: boolean;
  // Any field edit marks the draft dirty, and it stays dirty (finding #4).
  markInteracted: () => void;
  // A functional update for edits the shared list does not own (the Log form's performed sets).
  editRows: (update: (rows: T[]) => T[]) => void;
  // Replace the draft with a restored one, keeping fresh row keys clear of the stored ones.
  restore: (draft: { trainingType: string; exercises: T[] }) => void;
  // Which exercise the composition strip last focused (ADR-0074): view state, never the draft.
  selectedPosition: number | null;
  focusExercise: (position: number) => void;
  addExercise: (exercise: PickedExercise) => void;
  createExercise: (name: string) => Promise<{ error: string | null }>;
  removeExercise: (key: number) => void;
  updateExercise: (key: number, patch: Partial<PlanExerciseRow>) => void;
  groupWithNext: (index: number) => void;
  ungroupAt: (index: number) => void;
  setRoundRest: (index: number, roundRestSeconds: number | null) => void;
  moveExercise: (from: number, to: number) => void;
  canMove: (from: number, to: number) => boolean;
}

// The exercise-list editor both Hand-Authored forms share (audit C-1): the rows, Superset
// grouping and reorder, composition-strip focus, and dirty tracking for the navigation guard.
// The record half and the submit belong to each form.
export function useHandAuthoredExercises<T extends PlanExerciseRow>({
  initialRows,
  initialTrainingType,
  makeRow,
  hasSensitiveConstraint,
}: UseHandAuthoredExercisesOptions<T>): HandAuthoredExercises<T> {
  const [initial] = useState(initialRows);
  const [exercises, setExercises] = useState<T[]>(initial);
  const [trainingType, setTrainingType] = useState(initialTrainingType);
  // Coarse, sticky dirty tracking: any field edit flips `interacted`, and it never resets. A
  // seeded form's baseline is its seeded exercise count, so it is dirty once the user edits a
  // field or adds or removes an exercise.
  const [interacted, setInteracted] = useState(false);
  const isDirty = interacted || exercises.length !== initial.length;
  useNavigationGuard(isDirty);
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);

  const markInteracted = useCallback(() => setInteracted(true), []);

  const restore = useCallback((draft: { trainingType: string; exercises: T[] }) => {
    reserveKeysThrough(highestDraftKey(draft.exercises));
    setTrainingType(draft.trainingType);
    setExercises(draft.exercises);
    setInteracted(true);
  }, []);

  // `suppressAuthoredSupersets` returns the same list when there is nothing to unlink, so row
  // identity (and React keys) hold.
  const effectiveExercises = hasSensitiveConstraint
    ? suppressAuthoredSupersets(exercises)
    : exercises;

  // Selecting a composition tile moves focus to its exercise card (idea 5): mark it selected and
  // scroll the card (anchored by id in the list) into view.
  const focusExercise = (position: number) => {
    setSelectedPosition(position);
    if (typeof document !== "undefined") {
      document
        .getElementById(`authored-exercise-${position}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const addExercise = (exercise: PickedExercise) => {
    setInteracted(true);
    setExercises((current) => [...current, makeRow(exercise)]);
  };

  // Resolve a typed movement to a catalog Exercise (minting a `user_entered` one on a miss,
  // ADR-0033) and add it. The action returns a user-safe error whenever it yields no exercise,
  // so it is surfaced verbatim for the picker to show.
  const createExercise = async (name: string): Promise<{ error: string | null }> => {
    const outcome = await resolveAuthoredExercise(name);
    if (outcome.exercise) addExercise(outcome.exercise);
    return { error: outcome.error };
  };

  // Removing a member can leave a one-member Superset, which is not a valid group (ADR-0023);
  // dissolve any such leftover so the draft never renders or submits one.
  const removeExercise = (key: number) => {
    setInteracted(true);
    setExercises((current) =>
      dissolveSingletonGroups(current.filter((row) => row.key !== key)),
    );
  };

  const updateExercise = (key: number, patch: Partial<PlanExerciseRow>) =>
    setExercises((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );

  // Superset editing reuses the shared structural operations (ADR-0023), all keyed by list
  // position so they stay aligned to the rendered order.
  const groupWithNext = (index: number) => {
    setInteracted(true);
    setExercises((current) => groupExerciseWithNext(current, index));
  };

  const ungroupAt = (index: number) => {
    setInteracted(true);
    setExercises((current) => ungroupExercise(current, index));
  };

  const setRoundRest = (index: number, roundRestSeconds: number | null) =>
    setExercises((current) => setExerciseRoundRest(current, index, roundRestSeconds));

  // Selection is position-based (ADR-0074), so a reorder moves it with the exercise it points
  // at, mirroring the contiguity-preserving move `reorderExercise` applies.
  const moveExercise = (from: number, to: number) => {
    setInteracted(true);
    setSelectedPosition((current) =>
      remapSelectionAfterReorder(exercises, from, to, current),
    );
    setExercises((current) => reorderExercise(current, from, to));
  };

  // `reorderExercise` returns its input unchanged when a move would split a Superset (or is a
  // no-op), so an identity result means the move is illegal: the control is disabled rather
  // than left to dead-click.
  const canMove = (from: number, to: number) =>
    reorderExercise(effectiveExercises, from, to) !== effectiveExercises;

  return {
    exercises,
    effectiveExercises,
    layout: authoredSupersetLayout(effectiveExercises, hasSensitiveConstraint),
    trainingType,
    setTrainingType,
    isDirty,
    markInteracted,
    editRows: setExercises,
    restore,
    selectedPosition,
    focusExercise,
    addExercise,
    createExercise,
    removeExercise,
    updateExercise,
    groupWithNext,
    ungroupAt,
    setRoundRest,
    moveExercise,
    canMove,
  };
}
