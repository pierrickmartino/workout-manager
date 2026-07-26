import Link from "next/link";

import { fetchHistory, type LoggedSession, type LoggedSet } from "@/lib/logs";
import { formatLoad } from "@/lib/load";
import { formatQuantity } from "@/lib/quantity";
import { PageHeader } from "@/components/pulse/page-header";
import { Alert } from "@/components/pulse/alert";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
          {history.map((entry) => (
            <li key={entry.id}>
              <LoggedSessionCard entry={entry} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function LoggedSessionCard({ entry }: { entry: LoggedSession }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold capitalize text-text-primary">
          {entry.training_type} session
        </h2>
        <span className="label-mono text-[10px] text-text-muted">
          {entry.performed_on}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-[1fr_3rem_4rem_3rem] gap-2 px-1">
          <SetHead>Exercise</SetHead>
          <SetHead className="text-right">Reps</SetHead>
          <SetHead className="text-right">Load</SetHead>
          <SetHead className="text-right">RPE</SetHead>
        </div>
        {entry.logged_sets.map((loggedSet) => (
          <LoggedSetRow key={loggedSet.position} loggedSet={loggedSet} />
        ))}
      </div>
    </Card>
  );
}

function SetHead({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`label-mono text-[9px] text-text-muted ${className ?? ""}`}
    >
      {children}
    </span>
  );
}

function LoggedSetRow({ loggedSet }: { loggedSet: LoggedSet }) {
  return (
    <div className="grid grid-cols-[1fr_3rem_4rem_3rem] items-center gap-2 rounded-sm border border-border bg-base/40 px-3 py-2.5">
      <span className="truncate font-sans text-[13px] text-text-primary">
        {loggedSet.exercise_name}
      </span>
      <span className="text-right font-display text-sm font-semibold text-text-primary">
        {formatQuantity(loggedSet.quantity)}
      </span>
      <span className="text-right font-mono text-[13px] text-text-secondary">
        {formatLoad(loggedSet.load)}
      </span>
      <span className="text-right font-mono text-[13px] text-cyan">
        {loggedSet.perceived_difficulty ?? "—"}
      </span>
    </div>
  );
}
