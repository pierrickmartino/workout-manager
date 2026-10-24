import Link from "next/link";
import { Copy, Repeat } from "@/components/pulse/icons";

import type { WeightUnit } from "@/lib/weight-unit";
import type { HistoryCard, HistoryWindowView } from "@/lib/history-window";
import { sessionReuse } from "@/lib/session-reuse";
import {
  DELETE_TAIL_FIRST_REASON,
  UNCOMPLETE_TAIL_FIRST_REASON,
} from "@/lib/log-correction-reasons";
import { Card } from "@/components/ui/card";
import { DeleteLogControl } from "@/components/DeleteLogControl";
import { OutcomeToggle } from "@/components/OutcomeToggle";
import { LoggedSetTable } from "@/components/LoggedSetTable";
import { NAV_FORWARD } from "@/lib/nav-direction";

// History's cards, or the month's empty state when nothing matches, beside Month view's grid
// (ADR-0138, ADR-0140). A thin renderer of the window plan `planHistoryWindow` computes (ADR-0128);
// what to fetch and when stays with `HistoryBrowser`.
export function HistoryCardList({
  windowPlan,
  isEmpty,
  emptyMessage,
  onClear,
  unit,
  onCorrected,
  onRetry,
  onShowMore,
}: {
  windowPlan: HistoryWindowView;
  // Whether nothing matches the filters: the empty state, not a window still loading.
  isEmpty: boolean;
  emptyMessage: string;
  // Clears the filters from the empty state; omitted when no facet is active.
  onClear?: () => void;
  unit: WeightUnit;
  onCorrected: (card: HistoryCard) => void;
  onRetry: () => void;
  onShowMore: () => void;
}): React.JSX.Element {
  if (isEmpty) {
    return (
      <Card className="flex flex-col items-start gap-3 p-6">
        <p className="font-sans text-sm text-text-secondary">{emptyMessage}</p>
        {onClear !== undefined ? (
          <button
            type="button"
            onClick={onClear}
            className="label-mono text-[11px] text-cyan hover:underline"
          >
            Clear filters
          </button>
        ) : null}
      </Card>
    );
  }
  return (
    <ol className="flex list-none flex-col gap-4 p-0">
      {windowPlan.entries.map(({ card, deletable, uncompletable }) => {
        // The server (the one contiguity gate, ADR-0034) decides whether each record may be
        // deleted / un-completed; the verdict rides on the index row, which is re-read on every
        // revalidation, so the control is disabled before the user clicks into a `409` (user
        // story 27). The server stays authoritative.
        const deleteDisabled = !deletable;
        const uncompleteDisabled = !uncompletable;
        return (
          // Off-screen cards skip layout and paint but stay in the DOM and the accessibility
          // tree (ADR-0097).
          <li key={card.id} className="history-row-defer">
            <LoggedSessionCard
              entry={card}
              unit={unit}
              deleteDisabled={deleteDisabled}
              deleteReason={deleteDisabled ? DELETE_TAIL_FIRST_REASON : null}
              uncompleteDisabled={uncompleteDisabled}
              uncompleteReason={uncompleteDisabled ? UNCOMPLETE_TAIL_FIRST_REASON : null}
              onCorrected={onCorrected}
            />
          </li>
        );
      })}
      <HistoryWindowStatus
        pendingCount={windowPlan.pendingCount}
        failedCount={windowPlan.failedCount}
        hiddenCount={windowPlan.hiddenCount}
        onRetry={onRetry}
        onShowMore={onShowMore}
      />
    </ol>
  );
}

// The row after the last card: what is still loading, a failed window with its retry, or the
// "Show more" control. Renders nothing when every match is on screen.
function HistoryWindowStatus({
  pendingCount,
  failedCount,
  hiddenCount,
  onRetry,
  onShowMore,
}: {
  pendingCount: number;
  failedCount: number;
  hiddenCount: number;
  onRetry: () => void;
  onShowMore: () => void;
}): React.JSX.Element | null {
  if (failedCount > 0) {
    return (
      <li className="flex flex-wrap items-center gap-3">
        <span role="alert" className="font-sans text-sm text-magenta">
          Could not load {failedCount} {failedCount === 1 ? "session" : "sessions"}.
        </span>
        <button
          type="button"
          onClick={onRetry}
          className="label-mono text-[11px] text-cyan hover:underline"
        >
          Try again
        </button>
      </li>
    );
  }
  if (pendingCount > 0) {
    return (
      <li role="status" className="label-mono text-[11px] text-text-muted">
        Loading {pendingCount} more…
      </li>
    );
  }
  if (hiddenCount > 0) {
    return (
      <li>
        <button
          type="button"
          onClick={onShowMore}
          className="label-mono rounded-md border border-border bg-elevated px-3 py-1.5 text-[10px] text-text-primary transition-colors hover:border-cyan hover:text-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 motion-reduce:transition-none"
        >
          Show more ({hiddenCount} older)
        </button>
      </li>
    );
  }
  return null;
}

function LoggedSessionCard({
  entry,
  unit,
  deleteDisabled,
  deleteReason,
  uncompleteDisabled,
  uncompleteReason,
  onCorrected,
}: {
  entry: HistoryCard;
  unit: WeightUnit;
  deleteDisabled: boolean;
  deleteReason: string | null;
  uncompleteDisabled: boolean;
  uncompleteReason: string | null;
  onCorrected: (card: HistoryCard) => void;
}): React.JSX.Element {
  // Shared pill styling for the Open / Edit link actions, so the whole cluster reads as
  // one row of tappable pills alongside the outcome toggle and delete controls.
  const pillClass =
    "label-mono inline-flex items-center rounded-md border border-border bg-elevated px-3 py-1.5 text-[10px] text-text-primary transition-colors hover:border-cyan hover:text-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 motion-reduce:transition-none";
  // The reuse shortcut wears the cyan accent (matching the record detail page's reuse action)
  // so it reads as the highlighted "do this again" affordance, not just another link.
  const reusePillClass =
    "label-mono inline-flex items-center gap-1.5 rounded-md border border-cyan/40 bg-cyan-dim px-3 py-1.5 text-[10px] text-cyan transition-colors hover:border-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 motion-reduce:transition-none";

  // One reuse affordance per record, from the shared seam — so the row and the detail page can
  // never disagree (ADR-0031/0044). Plan-backed → Repeat its existing plan (no copy); plan-less
  // → Capture into a new reusable plan. Present regardless of Completion Outcome.
  const reuse = sessionReuse(entry);

  return (
    <Card className="flex flex-col gap-4 p-5">
      {/* Title and date first, each on its own line (date nowrap so it never breaks in
          two), then the actions on a dedicated wrapping row of their own — so the two
          never collide or interleave on a narrow phone. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-balance font-display text-lg font-semibold capitalize text-text-primary">
            {entry.training_type} session
          </h2>
          <span className="label-mono whitespace-nowrap text-[10px] text-text-muted">
            {entry.performed_on}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* A Completion Outcome rides only on a plan-backed record (ADR-0031); an
              ad-hoc record gates no Protocol, so it shows no outcome toggle. */}
          {entry.session_id !== null ? (
            <OutcomeToggle
              logId={entry.id}
              outcome={entry.completion_outcome}
              uncompleteDisabled={uncompleteDisabled}
              uncompleteReason={uncompleteReason}
              onCorrected={onCorrected}
            />
          ) : null}
          <Link {...NAV_FORWARD} href={`/history/${entry.id}`} className={pillClass}>
            Open
          </Link>
          {reuse.canRepeat && reuse.repeatHref !== null ? (
            <Link {...NAV_FORWARD} href={reuse.repeatHref} className={reusePillClass}>
              <Repeat className="h-3 w-3" />
              Repeat
            </Link>
          ) : (
            <Link {...NAV_FORWARD} href={reuse.captureHref} className={reusePillClass}>
              <Copy className="h-3 w-3" />
              Capture
            </Link>
          )}
          <Link {...NAV_FORWARD} href={`/history/${entry.id}/edit`} className={pillClass}>
            Edit
          </Link>
          <DeleteLogControl
            logId={entry.id}
            disabled={deleteDisabled}
            reason={deleteReason}
          />
        </div>
      </div>

      <LoggedSetTable sets={entry.logged_sets} unit={unit} />
    </Card>
  );
}
