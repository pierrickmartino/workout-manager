import Link from "next/link";
import { Play } from "lucide-react";

import type { RecentSessionRow } from "@/lib/recent-sessions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

// The Train page's "Recent Sessions" panel (CONTEXT: Recent Sessions): the user's up-to-five
// most-recently-performed standalone Session plans, each with a one-tap Start into a Live
// Session — the proactive, Train-side cousin of Repeat. Presentational only; the selection,
// dedupe, and exercise-preview logic all live in the `recent-sessions` view-model. Renders
// nothing when there is nothing to resume, so the Train page can mount it unconditionally.
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
            <RecentSessionCard row={row} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function RecentSessionCard({
  row,
}: {
  row: RecentSessionRow;
}): React.JSX.Element {
  return (
    <Card className="flex flex-col gap-3 p-4 transition-colors hover:border-cyan/40">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="truncate font-display text-base font-semibold text-text-primary">
            {row.displayName}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="cyan" className="capitalize">
              {row.trainingType}
            </Badge>
            {/* A performed date is honest record data (History shows it too) — not the
                forbidden calendar "today" (ADR-0001). */}
            <span className="label-mono text-[10px] text-text-muted">
              Last trained {row.lastPerformedOn}
            </span>
          </div>
        </div>
        {/* Start deep-links straight into the plan's Live Session (Q2); the concurrency guard
            lives in LiveSessionScreen (ADR-0012). Deliberately `secondary`, not primary: this
            Start repeats once per Recent Session card (up to five), under the launchpad's one
            filled-teal "Generate a protocol" hero — so it is not this screen's primary action.
            Contrast the Session detail page, where a lone "Start session" IS the page hero and
            stays primary. Emphasis is per-screen: a repeated list action is never the primary. */}
        <Link
          href={row.startHref}
          className={buttonVariants({ variant: "secondary", className: "shrink-0" })}
        >
          <Play className="h-4 w-4" />
          Start
        </Link>
      </div>

      {/* The plan's first movements (≤3, CONTEXT: Recent Sessions) — a preview of what Start
          runs, drawn from the plan's Exercise Prescriptions, never the last record. */}
      {row.previewExercises.length > 0 ? (
        <p className="truncate font-mono text-[12px] text-text-secondary">
          {row.previewExercises.join(" · ")}
        </p>
      ) : null}
    </Card>
  );
}
