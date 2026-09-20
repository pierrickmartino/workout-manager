import type { RecentSessionRow } from "@/lib/recent-sessions";
import { recentSessionCardModel } from "@/lib/session-card";
import { SessionCard } from "@/components/SessionCard";

// The Train page's "Recent Sessions" panel (CONTEXT: Recent Sessions): the user's up-to-five
// most-recently-performed standalone Session plans, each with a one-tap Start into a Live
// Session — the proactive, Train-side cousin of Repeat. Presentational only; the selection,
// dedupe, and exercise-preview logic all live in the `recent-sessions` view-model. Each row renders
// through the shared `SessionCard` (the same format My Sessions reuses), fed by the `session-card`
// mapper. Renders nothing when there is nothing to resume, so the Train page can mount it
// unconditionally.
export function RecentSessions({
  rows,
}: {
  rows: RecentSessionRow[];
}): React.JSX.Element | null {
  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="label-mono text-[11px] text-text-muted">
        TRAIN // PICK UP AGAIN
      </span>
      <ol className="flex list-none flex-col gap-3 p-0">
        {rows.map((row) => (
          <li key={row.id}>
            <SessionCard model={recentSessionCardModel(row)} />
          </li>
        ))}
      </ol>
    </div>
  );
}
