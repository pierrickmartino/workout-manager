import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { fetchProtocol } from "@/lib/protocols";
import type { ProtocolProgress, ProtocolSession } from "@/lib/protocols-types";
import type { ExercisePrescription } from "@/lib/sessions-types";
import { PageHeader } from "@/components/pulse/page-header";
import { SectionHeader } from "@/components/pulse/section-header";
import { SegmentedBar } from "@/components/pulse/segmented-bar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Displays a user-owned multi-week Protocol: its self-paced next Session and the
// full week-by-week schedule. Upcoming Sessions show the recommended load already
// progressed from the user's Logged Sets (ADR-0004); the backend returns 404
// (→ notFound) for anyone who does not own the Protocol.
export default async function ProtocolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const protocolId = Number(id);
  if (!Number.isInteger(protocolId)) notFound();

  const envelope = await fetchProtocol(protocolId);
  if (!envelope.success || !envelope.data) {
    notFound();
  }

  const protocol = envelope.data;
  const total = protocol.sessions.length;
  const done = protocol.completed_count;
  const progress = total > 0 ? done / total : 0;

  return (
    <section className="flex flex-col gap-7">
      <PageHeader
        overline="PULSE // PROTOCOL"
        title={<span className="capitalize">{protocol.training_type}</span>}
        action={<Badge variant="cyan">{protocol.weeks}W</Badge>}
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
        <NextUp protocol={protocol} />
      </Card>

      <div className="flex flex-col gap-4">
        <SectionHeader meta={`${total} SESSIONS`}>SCHEDULE</SectionHeader>
        <ol className="flex list-none flex-col gap-3 p-0">
          {protocol.sessions.map((session, index) => (
            <li key={session.session_id}>
              <SessionCard
                session={session}
                index={index + 1}
                isNext={session.session_id === protocol.next_session?.session_id}
              />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function NextUp({ protocol }: { protocol: ProtocolProgress }) {
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
  return (
    <div className="flex flex-col gap-3">
      <span className="label-mono text-[10px] text-text-muted">NEXT UP</span>
      <SessionCard session={next} index={next.day} isNext />
    </div>
  );
}

function SessionCard({
  session,
  index,
  isNext,
}: {
  session: ProtocolSession;
  index: number;
  isNext: boolean;
}) {
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
          <span className="font-display text-[15px] font-semibold text-text-primary">
            Week {session.week}, Day {session.day}
            {session.title ? ` — ${session.title}` : ""}
          </span>
          <span className="label-mono text-[9px] text-text-muted">
            {session.prescriptions.length} EXERCISES
          </span>
        </div>
        {isNext ? <Badge variant="cyan">NEXT</Badge> : null}
      </div>

      <ul className="flex flex-col gap-1.5 border-t border-border pt-3">
        {session.prescriptions.map((prescription) => (
          <li key={prescription.position}>
            <PrescriptionRow prescription={prescription} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function PrescriptionRow({
  prescription,
}: {
  prescription: ExercisePrescription;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Link
        href={`/exercises/${prescription.exercise_id}`}
        className="truncate font-sans text-[13px] text-text-secondary transition-colors hover:text-cyan"
      >
        {prescription.exercise_name}
      </Link>
      <span className="shrink-0 font-mono text-[12px] text-text-muted">
        {prescription.sets} × {prescription.reps}
        {prescription.recommended_load
          ? ` @ ${prescription.recommended_load}`
          : ""}
      </span>
    </div>
  );
}
