import Link from "next/link";

import type {
  ExerciseProgress,
  ExerciseProgressPoint,
} from "@/lib/progress-types";
import { formatLoad } from "@/lib/load";
import { formatQuantity } from "@/lib/quantity";
import { Card } from "@/components/ui/card";

interface HistoryPanelProps {
  progress: ExerciseProgress;
}

// The HISTORY lens (ADR-0017): every Logged Session of this Exercise, oldest-first,
// with per-Logged-Set reps, Load, and perceived difficulty. This is the read that
// used to back the standalone /exercises/[id]/progress route, now folded in. An
// Exercise the user has never performed shows an honest empty state, not an error.
export function HistoryPanel({ progress }: HistoryPanelProps): React.JSX.Element {
  const label = progress.exercise_name || "this exercise";

  if (progress.points.length === 0) {
    return (
      <Card className="flex flex-col items-start gap-3 p-6">
        <p className="font-sans text-sm text-text-secondary">
          You haven&apos;t logged {label} yet.
        </p>
        <Link
          href="/history"
          className="label-mono text-[11px] text-cyan hover:underline"
        >
          Review your training history →
        </Link>
      </Card>
    );
  }

  return (
    <ol className="flex list-none flex-col gap-4 p-0">
      {progress.points.map((point) => (
        <li key={point.logged_session_id}>
          <ProgressPoint point={point} />
        </li>
      ))}
    </ol>
  );
}

function ProgressPoint({ point }: { point: ExerciseProgressPoint }) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="label-mono text-[11px] text-cyan">{point.performed_on}</h2>

      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr] gap-2 px-1">
          <span className="label-mono text-[9px] text-text-muted">Set</span>
          <span className="label-mono text-right text-[9px] text-text-muted">
            Reps
          </span>
          <span className="label-mono text-right text-[9px] text-text-muted">
            Load
          </span>
          <span className="label-mono text-right text-[9px] text-text-muted">
            RPE
          </span>
        </div>
        {point.sets.map((set) => (
          <div
            key={set.position}
            className="grid grid-cols-[2.5rem_1fr_1fr_1fr] items-center gap-2 rounded-sm border border-border bg-base/40 px-3 py-2.5"
          >
            <span className="font-mono text-[13px] font-bold text-cyan">
              {set.position + 1}
            </span>
            <span className="text-right font-display text-sm font-semibold text-text-primary">
              {formatQuantity(set.quantity)}
            </span>
            <span className="text-right font-mono text-[13px] text-text-secondary">
              {formatLoad(set.load)}
            </span>
            <span className="text-right font-mono text-[13px] text-cyan">
              {set.perceived_difficulty ?? "—"}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
