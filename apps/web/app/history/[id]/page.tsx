import Link from "next/link";
import { notFound } from "next/navigation";
import { Copy, PenLine } from "lucide-react";

import { fetchHistory } from "@/lib/logs";
import { fetchHome } from "@/lib/home";
import { evaluateDeletion } from "@/lib/log-deletion";
import { evaluateUncomplete } from "@/lib/log-outcome";
import { loggedSessionDetail } from "@/lib/logged-session-detail";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { Alert } from "@/components/pulse/alert";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoggedSetTable } from "@/components/LoggedSetTable";
import { DeleteLogControl } from "@/components/DeleteLogControl";
import { OutcomeToggle } from "@/components/OutcomeToggle";
import { DuplicateButton } from "@/components/DuplicateButton";

interface LogDetailPageProps {
  params: Promise<{ id: string }>;
}

// The read-only detail of one Logged Session — the record side's "open" (ADR-0031/0044). It
// shows what the user actually did (sets, load, RPE, outcome, duration), links back to the
// source plan for a plan-backed record, and is the home for the reuse action: Duplicate the
// plan (plan-backed, ADR-0043) or Capture into a new reusable plan (ad-hoc, ADR-0044). The
// record is loaded from the user's own history server-side (the JWT never reaches the
// browser), so a record that is not the caller's is simply absent and 404s — the same
// ownership boundary the API enforces.
export default async function LogDetailPage({ params }: LogDetailPageProps) {
  const { id } = await params;
  const logId = Number(id);
  if (!Number.isInteger(logId)) notFound();

  const [envelope, homeEnvelope] = await Promise.all([fetchHistory(), fetchHome()]);
  if (!envelope.success || !envelope.data) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader overline="PULSE // STATS" title="Session detail" />
        <Alert tone="error">
          Could not load your history: {envelope.error ?? "unknown error"}
        </Alert>
        <BackLink href="/history">Back to history</BackLink>
      </section>
    );
  }

  const history = envelope.data;
  const record = history.find((entry) => entry.id === logId);
  if (record === undefined) notFound();

  // The Current Protocol's Session ordering, for the client mirror of the contiguity gate
  // (ADR-0034) — the same source the History list uses to disable a delete/un-complete that
  // the server would refuse (409). The server stays authoritative for any other Protocol.
  const protocolSessionOrders =
    homeEnvelope.success && homeEnvelope.data?.current_protocol
      ? [homeEnvelope.data.current_protocol.sessions.map((session) => session.session_id)]
      : [];

  const deletion = evaluateDeletion(record, history, protocolSessionOrders);
  const uncomplete = evaluateUncomplete(record, history, protocolSessionOrders);
  const detail = loggedSessionDetail(record);

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        overline="PULSE // STATS"
        title={`${record.training_type} session`}
        action={
          <span className="label-mono text-[11px] text-text-muted">
            {record.performed_on}
          </span>
        }
      />

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          {record.completion_outcome !== null ? (
            <Badge variant={record.completion_outcome === "completed" ? "cyan" : "muted"}>
              {record.completion_outcome.toUpperCase()}
            </Badge>
          ) : null}
          {detail.durationLabel !== null ? (
            <span className="label-mono text-[11px] text-text-muted">
              {detail.durationLabel} active
            </span>
          ) : null}
          {detail.sourceSessionHref !== null ? (
            <Link
              href={detail.sourceSessionHref}
              className="label-mono text-[11px] text-cyan hover:underline"
            >
              View the plan →
            </Link>
          ) : null}
        </div>

        <LoggedSetTable sets={record.logged_sets} />
      </Card>

      {/* The record's own controls — correct it, set its outcome (plan-backed only), or
          remove it (ADR-0034). The server re-vets contiguity even when a control is enabled. */}
      <Card className="flex flex-col gap-4 p-5">
        <h2 className="font-display text-sm font-semibold text-text-primary">
          This record
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          {detail.isPlanBacked ? (
            <OutcomeToggle
              logId={record.id}
              outcome={record.completion_outcome}
              uncompleteDisabled={!uncomplete.allowed}
              uncompleteReason={uncomplete.reason}
            />
          ) : null}
          <Link
            href={detail.editHref}
            className="label-mono inline-flex items-center gap-1.5 text-[11px] text-cyan hover:underline"
          >
            <PenLine className="h-3.5 w-3.5" />
            Edit
          </Link>
          <DeleteLogControl
            logId={record.id}
            disabled={!deletion.allowed}
            reason={deletion.reason}
          />
        </div>
      </Card>

      {/* The reuse action — mutually exclusive by the plan/record split. A plan-backed
          record Duplicates its plan (ADR-0043); an ad-hoc one is Captured into a new
          reusable plan (ADR-0044). */}
      <Card className="flex flex-col gap-3 p-5">
        <h2 className="font-display text-sm font-semibold text-text-primary">
          Reuse this workout
        </h2>
        {detail.canDuplicate && detail.sourceSessionId !== null ? (
          <>
            <p className="font-mono text-[12px] leading-relaxed text-text-muted">
              Copy the plan behind this session into a new standalone workout you can tweak
              and run again.
            </p>
            <DuplicateButton sessionId={detail.sourceSessionId} />
          </>
        ) : (
          <>
            <p className="font-mono text-[12px] leading-relaxed text-text-muted">
              Turn what you did into a reusable plan — we&apos;ll pre-fill a builder from
              this record so you can set rest, tempo, and any supersets before saving.
            </p>
            <Link
              href={detail.captureHref}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-cyan/40 bg-cyan/[0.06] px-4 py-2.5 font-mono text-[13px] text-cyan hover:bg-cyan/[0.12]"
            >
              <Copy className="h-4 w-4" />
              Save as reusable session
            </Link>
          </>
        )}
      </Card>

      <BackLink href="/history">Back to history</BackLink>
    </section>
  );
}
