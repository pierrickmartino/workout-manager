import Link from "next/link";

import { fetchHistory, type LoggedSession } from "@/lib/logs";
import {
  DELETE_TAIL_FIRST_REASON,
  UNCOMPLETE_TAIL_FIRST_REASON,
} from "@/lib/log-correction-reasons";
import { PageHeader } from "@/components/pulse/page-header";
import { Alert } from "@/components/pulse/alert";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeleteLogControl } from "@/components/DeleteLogControl";
import { OutcomeToggle } from "@/components/OutcomeToggle";
import { LoggedSetTable } from "@/components/LoggedSetTable";

// Lists the user's completed Logged Sessions — the record side of the plan/record
// split — newest first, each with its Logged Sets and perceived difficulty.
export default async function HistoryPage() {
  const envelope = await fetchHistory();

  if (!envelope.success || !envelope.data) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader overline="PULSE // STATS" title="Training history" />
        <Alert tone="error">
          Could not load your history: {envelope.error ?? "unknown error"}
        </Alert>
      </section>
    );
  }

  const history = envelope.data;

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        overline="PULSE // STATS"
        title="Training history"
        action={
          <div className="flex items-center gap-3">
            <Link
              href="/logs/new"
              className="label-mono text-[11px] text-cyan hover:underline"
            >
              + Log a movement
            </Link>
            <Badge variant="muted">{history.length} LOGGED</Badge>
          </div>
        }
      />

      {history.length === 0 ? (
        <Card className="flex flex-col items-start gap-3 p-6">
          <p className="font-sans text-sm text-text-secondary">
            You haven&apos;t logged any sessions yet.
          </p>
          <Link
            href="/sessions/new"
            className="label-mono text-[11px] text-cyan hover:underline"
          >
            Generate a workout →
          </Link>
          <Link
            href="/logs/new"
            className="label-mono text-[11px] text-cyan hover:underline"
          >
            Or log something you did →
          </Link>
        </Card>
      ) : (
        <ol className="flex list-none flex-col gap-4 p-0">
          {history.map((entry) => {
            // The server (the one contiguity gate, ADR-0034) decides whether each record
            // may be deleted / un-completed and rides the verdict on the record, so the
            // control is disabled before the user clicks into a `409` (user story 27). An
            // absent flag (older payloads) leaves the control enabled — the server stays
            // authoritative and still rejects.
            const deleteDisabled = entry.deletable === false;
            const uncompleteDisabled = entry.uncompletable === false;
            return (
              <li key={entry.id}>
                <LoggedSessionCard
                  entry={entry}
                  deleteDisabled={deleteDisabled}
                  deleteReason={deleteDisabled ? DELETE_TAIL_FIRST_REASON : null}
                  uncompleteDisabled={uncompleteDisabled}
                  uncompleteReason={
                    uncompleteDisabled ? UNCOMPLETE_TAIL_FIRST_REASON : null
                  }
                />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function LoggedSessionCard({
  entry,
  deleteDisabled,
  deleteReason,
  uncompleteDisabled,
  uncompleteReason,
}: {
  entry: LoggedSession;
  deleteDisabled: boolean;
  deleteReason: string | null;
  uncompleteDisabled: boolean;
  uncompleteReason: string | null;
}) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-lg font-semibold capitalize text-text-primary">
          {entry.training_type} session
        </h2>
        <div className="flex items-start gap-3">
          {/* A Completion Outcome rides only on a plan-backed record (ADR-0031); an
              ad-hoc record gates no Protocol, so it shows no outcome toggle. */}
          {entry.session_id !== null ? (
            <OutcomeToggle
              logId={entry.id}
              outcome={entry.completion_outcome}
              uncompleteDisabled={uncompleteDisabled}
              uncompleteReason={uncompleteReason}
            />
          ) : null}
          <Link
            href={`/history/${entry.id}`}
            className="label-mono text-[10px] text-cyan hover:underline"
          >
            Open
          </Link>
          <Link
            href={`/history/${entry.id}/edit`}
            className="label-mono text-[10px] text-cyan hover:underline"
          >
            Edit
          </Link>
          <DeleteLogControl
            logId={entry.id}
            disabled={deleteDisabled}
            reason={deleteReason}
          />
          <span className="label-mono text-[10px] text-text-muted">
            {entry.performed_on}
          </span>
        </div>
      </div>

      <LoggedSetTable sets={entry.logged_sets} />
    </Card>
  );
}
