// PROTOTYPE — throwaway (branch `prototype/session-card-unify`). Never merge to main.
//
// One card model both Train ("Pick up again") and My Sessions feed, carrying the union of what the
// two surfaces show today: Train's performed date + exercise preview, the library's favorite,
// Logged Count and detail link. Kept out of the "use client" variants file so the Train Server
// Component can call it.

import type { SessionSummary } from "@/lib/session-library";
import { sessionRowTitle } from "@/lib/session-library";
import {
  trainingTypeBadgeVariant,
  type TrainingTypeBadgeVariant,
} from "@/lib/training-type-badge";

export interface ProtoCardModel {
  id: number;
  displayName: string;
  trainingType: string;
  badgeVariant: TrainingTypeBadgeVariant;
  exerciseCount: number;
  // null = we could not read the plan's detail, so no preview (My Sessions N+1 read failed).
  previewExercises: string[];
  // null = never performed (or History did not reach it).
  lastPerformedOn: string | null;
  loggedCount: number;
  isFavorite: boolean;
  detailHref: string;
  startHref: string;
}

export function protoCardModel(
  summary: SessionSummary,
  lastPerformedOn: string | null,
  exerciseNames: readonly string[],
): ProtoCardModel {
  return {
    id: summary.id,
    displayName: sessionRowTitle(summary),
    trainingType: summary.training_type,
    badgeVariant: trainingTypeBadgeVariant(summary.training_type),
    exerciseCount: summary.exercise_count,
    previewExercises: exerciseNames.slice(0, 3),
    lastPerformedOn,
    loggedCount: summary.logged_count,
    isFavorite: summary.is_favorite,
    detailHref: `/sessions/${summary.id}`,
    startHref: `/sessions/${summary.id}/live`,
  };
}

// Newest performed date per plan, from the newest-first History feed.
export function lastPerformedBySession(
  history: readonly { session_id: number | null; performed_on: string }[],
): Map<number, string> {
  const map = new Map<number, string>();
  for (const record of history) {
    if (record.session_id !== null && !map.has(record.session_id)) {
      map.set(record.session_id, record.performed_on);
    }
  }
  return map;
}
