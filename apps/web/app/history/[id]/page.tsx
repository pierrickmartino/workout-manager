import Link from "next/link";
import { notFound } from "next/navigation";
import { Copy, PenLine, Repeat } from "lucide-react";

import { fetchLog } from "@/lib/logs";
import { loggedSessionDetail } from "@/lib/logged-session-detail";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoggedSetTable } from "@/components/LoggedSetTable";

interface LogDetailPageProps {
  params: Promise<{ id: string }>;
}

// The read-only detail of one Logged Session — the record side's "open" (ADR-0031/0044). It
// shows what the user actually did (sets, load, Performed Body Weight, RPE, outcome,
// duration), links back to the source plan for a plan-backed record, and is the home for the
// reuse action: Duplicate the plan (plan-backed, ADR-0043) or Capture into a new reusable
// plan (ad-hoc, ADR-0044). The record is read through the owner-scoped single-record route
// (`GET /api/logs/{id}`, the JWT never reaching the browser), so a record that is not the
// caller's 404s. Editing, deleting, and setting the outcome stay on the History row (their
// contiguity-gated controls belong with the list); this page is view + reuse, plus a plain
// link into the correction form.
export default async function LogDetailPage({ params }: LogDetailPageProps) {
  const { id } = await params;
  const logId = Number(id);
  if (!Number.isInteger(logId)) notFound();

  const envelope = await fetchLog(logId);
  if (!envelope.success || !envelope.data) notFound();

  const record = envelope.data;
  const detail = loggedSessionDetail(record);

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        overline="PULSE // STATS"
        title={`${record.training_type} session`}
        action={
          <span className="label-mono whitespace-nowrap text-[11px] text-text-muted">
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
          <Link
            href={detail.editHref}
            className="label-mono ml-auto inline-flex items-center gap-1.5 text-[11px] text-cyan hover:underline"
          >
            <PenLine className="h-3.5 w-3.5" />
            Edit
          </Link>
          {detail.sourceSessionHref !== null ? (
            <Link
              href={detail.sourceSessionHref}
              className="label-mono text-[11px] text-cyan hover:underline"
            >
              View the plan →
            </Link>
          ) : null}
        </div>

        <LoggedSetTable sets={record.logged_sets} showBodyWeight />
      </Card>

      {/* The reuse action — mutually exclusive by the plan/record split. A plan-backed
          record Repeats its existing plan (Q9) — Start or Log it again, no copy spawned;
          an ad-hoc one is Captured into a new reusable plan (ADR-0044). Forking a separate
          editable copy (Duplicate) lives on the Session view, not here. */}
      <Card className="flex flex-col gap-3 p-5">
        <h2 className="font-display text-sm font-semibold text-text-primary">
          Reuse this workout
        </h2>
        {detail.canRepeat && detail.repeatHref !== null ? (
          <>
            <p className="font-mono text-[12px] leading-relaxed text-text-muted">
              Run this same workout again — you&apos;ll land on its plan, ready to start a
              live session or log it after the fact. No copy is made.
            </p>
            <Link
              href={detail.repeatHref}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-cyan/40 bg-cyan/[0.06] px-4 py-2.5 font-mono text-[13px] text-cyan hover:bg-cyan/[0.12]"
            >
              <Repeat className="h-4 w-4" />
              Repeat
            </Link>
          </>
        ) : (
          <>
            <p className="font-mono text-[12px] leading-relaxed text-text-muted">
              Turn what you did into a reusable plan — we&apos;ll pre-fill a builder from
              this record so you can set rest, tempo, and any supersets before saving. This
              won&apos;t change your original record.
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
