import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, Play } from "lucide-react";

import { fetchProtocol } from "@/lib/protocols";
import { fetchHome } from "@/lib/home";
import type { ProtocolProgress, ProtocolSession } from "@/lib/protocols-types";
import type { ExercisePrescription } from "@/lib/sessions-types";
import { appendFrom } from "@/lib/back-target";
import {
  protocolScheduleCard,
  type ProtocolScheduleCard,
} from "@/lib/protocol-schedule";
import { PageHeader } from "@/components/pulse/page-header";
import { SectionHeader } from "@/components/pulse/section-header";
import { SegmentedBar } from "@/components/pulse/segmented-bar";
import { BackLink } from "@/components/pulse/back-link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

// Displays a user-owned multi-week Protocol: its self-paced next Session and the
// full week-by-week schedule. Upcoming Sessions show the recommended load already
// progressed from the user's Logged Sets (ADR-0004); the backend returns 404
// (→ notFound) for anyone who does not own the Protocol.
//
// The overview also completes the run flow (Q1–Q9): the Next Session can be Started
// into the Live route — but only when this is the user's Current Protocol, so a
// set-aside (superseded) Protocol never offers Start. Performed Sessions link to their
// *record* (History), never the plan; future Sessions are informational (their plan is
// already shown inline). "Current" is a cross-Protocol fact the Home read owns, so it is
// read alongside the Protocol; a failed Home read simply hides Start (safe default).
export default async function ProtocolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const protocolId = Number(id);
  if (!Number.isInteger(protocolId)) notFound();

  const [envelope, home] = await Promise.all([
    fetchProtocol(protocolId),
    fetchHome(),
  ]);
  if (!envelope.success || !envelope.data) {
    notFound();
  }

  const protocol = envelope.data;
  const total = protocol.sessions.length;
  const done = protocol.completed_count;
  const progress = total > 0 ? done / total : 0;

  // Is this the Current Protocol? Only then may its Next Session be Started (ADR-0008,
  // supersede one-way door). A failed/empty Home read resolves to `false`, hiding Start.
  const isCurrentProtocol =
    home.success && home.data?.current_protocol?.id === protocolId;

  return (
    <section className="flex flex-col gap-7">
      <PageHeader
        overline="PULSE // PROTOCOL"
        title={<span>{protocol.label}</span>}
        action={
          <div className="flex items-center gap-3">
            <Badge variant="cyan">{protocol.weeks}W</Badge>
            <Link
              href={`/protocols/${protocol.id}/edit`}
              className="label-mono text-[10px] text-text-muted transition-colors hover:text-cyan"
            >
              EDIT
            </Link>
          </div>
        }
      />

      {/* Protocol overview + completion. */}
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <span className="label-mono text-[11px] capitalize text-cyan">
            {protocol.objective}
          </span>
          <span className="label-mono text-[10px] text-text-muted">
            {done}/{total} DONE
          </span>
        </div>
        <SegmentedBar value={progress} segments={Math.min(total, 14) || 1} />
        <NextUp
          protocol={protocol}
          protocolId={protocolId}
          isCurrentProtocol={isCurrentProtocol}
        />
      </Card>

      <div className="flex flex-col gap-4">
        <SectionHeader meta={`${total} SESSIONS`}>SCHEDULE</SectionHeader>
        <ol className="flex list-none flex-col gap-3 p-0">
          {protocol.sessions.map((session, index) => {
            const card = protocolScheduleCard(session, {
              isNext: session.session_id === protocol.next_session?.session_id,
              isCurrentProtocol,
            });
            return (
              <li key={session.session_id}>
                <SessionCard
                  session={session}
                  index={index + 1}
                  isNext={card.state === "next"}
                  protocolId={protocolId}
                  headerHref={scheduleHeaderHref(card)}
                />
              </li>
            );
          })}
        </ol>
      </div>

      <BackLink href="/dashboard">Back to dashboard</BackLink>
    </section>
  );
}

// Where a schedule card's header navigates: the Next Session views its plan detail, a
// performed Session opens its record (History), and a future Session is not a link.
function scheduleHeaderHref(card: ProtocolScheduleCard): string | undefined {
  if (card.state === "next") return card.detailHref;
  if (card.state === "performed") return card.recordHref ?? undefined;
  return undefined;
}

function NextUp({
  protocol,
  protocolId,
  isCurrentProtocol,
}: {
  protocol: ProtocolProgress;
  protocolId: number;
  isCurrentProtocol: boolean;
}) {
  if (protocol.next_session === null) {
    return (
      <div className="flex items-center gap-2.5 rounded-sm border border-cyan/40 bg-cyan-dim px-3.5 py-3">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-cyan" aria-hidden />
        <span className="font-mono text-[13px] text-cyan">
          Protocol complete — every session has been logged.
        </span>
      </div>
    );
  }
  const next = protocol.next_session;
  // The hero card owns the run verbs: Start deep-links into the Live route (only on the
  // Current Protocol), View opens the plan detail. The schedule's copy of this Session
  // carries only the detail link, so Start lives in exactly one place on the page.
  const card = protocolScheduleCard(next, {
    isNext: true,
    isCurrentProtocol,
  });
  const startHref = card.state === "next" ? card.startHref : null;
  const detailHref = card.state === "next" ? card.detailHref : `/sessions/${next.session_id}`;
  return (
    <div className="flex flex-col gap-3">
      <span className="label-mono text-[10px] text-text-muted">NEXT UP</span>
      <SessionCard session={next} index={next.day} isNext protocolId={protocolId} />
      <div className="flex flex-col gap-2.5">
        {startHref ? (
          <Link href={startHref} className={buttonVariants({ className: "w-full" })}>
            <Play className="h-4 w-4" />
            Start session
          </Link>
        ) : null}
        <Link
          href={detailHref}
          className={buttonVariants({
            variant: "secondary",
            className: "w-full",
          })}
        >
          View session
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function SessionCard({
  session,
  index,
  isNext,
  protocolId,
  headerHref,
}: {
  session: ProtocolSession;
  index: number;
  isNext: boolean;
  protocolId: number;
  // When set, the header title becomes a link to this target (plan detail for the Next
  // Session, the record for a performed one). Absent for the Next Up hero (which uses
  // its own Start/View buttons) and for informational future Sessions. Kept separate
  // from the exercise-name links below so there is never an anchor nested in an anchor.
  headerHref?: string;
}) {
  const title = (
    <>
      Week {session.week}, Day {session.day}
      {session.title ? ` — ${session.title}` : ""}
    </>
  );
  return (
    <div
      className={`flex flex-col gap-3 rounded-md border p-4 ${
        isNext
          ? "border-cyan/60 bg-elevated"
          : "border-border bg-surface"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-sm font-mono text-[13px] font-bold ${
            isNext ? "bg-cyan text-on-accent" : "bg-base text-cyan"
          }`}
        >
          {String(index).padStart(2, "0")}
        </span>
        <div className="flex flex-1 flex-col gap-0.5">
          {headerHref ? (
            <Link
              href={headerHref}
              className="font-display text-[15px] font-semibold text-text-primary transition-colors hover:text-cyan"
            >
              {title}
            </Link>
          ) : (
            <span className="font-display text-[15px] font-semibold text-text-primary">
              {title}
            </span>
          )}
          <span className="label-mono text-[9px] text-text-muted">
            {session.prescriptions.length} EXERCISES
          </span>
        </div>
        {isNext ? <Badge variant="cyan">NEXT</Badge> : null}
      </div>

      <ul className="flex flex-col gap-1.5 border-t border-border pt-3">
        {session.prescriptions.map((prescription) => (
          <li key={prescription.position}>
            <PrescriptionRow
              prescription={prescription}
              protocolId={protocolId}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function PrescriptionRow({
  prescription,
  protocolId,
}: {
  prescription: ExercisePrescription;
  protocolId: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Link
        href={appendFrom(
          `/exercises/${prescription.exercise_id}`,
          `/protocols/${protocolId}`,
        )}
        className="truncate font-sans text-[13px] text-text-secondary transition-colors hover:text-cyan"
      >
        {prescription.exercise_name}
      </Link>
      <span className="shrink-0 font-mono text-[12px] text-text-muted">
        {prescription.sets} × {prescription.reps}
        {prescription.recommended_load
          ? ` @ ${prescription.recommended_load.text}`
          : ""}
      </span>
    </div>
  );
}
