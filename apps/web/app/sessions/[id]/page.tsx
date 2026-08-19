import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ClipboardCheck, Play } from "lucide-react";

import { SubstituteButton } from "@/components/SubstituteButton";
import { DuplicateButton } from "@/components/DuplicateButton";
import { AddExerciseButton } from "@/components/AddExerciseButton";
import { HarderVariationOffer } from "@/components/HarderVariationOffer";
import {
  fetchHarderVariation,
  fetchSession,
  type ExercisePrescription,
  type WorkoutSession,
} from "@/lib/sessions";
import {
  toHarderVariationOffer,
  type HarderVariationOffer as HarderVariationOfferView,
} from "@/lib/harder-variation-view";
import { toTempoView, type TempoView } from "@/lib/tempo-view";
import { supersetLayout, type SupersetSlot } from "@/lib/supersets";
import { appendFrom } from "@/lib/back-target";
import { PageHeader } from "@/components/pulse/page-header";
import { SectionHeader } from "@/components/pulse/section-header";
import { DataList } from "@/components/pulse/data-list";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

// Displays a generated standalone Session and its Exercise Prescriptions. The
// session is user-owned: the backend returns 404 (→ notFound) for anyone else.
export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId)) notFound();

  const envelope = await fetchSession(sessionId);
  if (!envelope.success || !envelope.data) {
    notFound();
  }

  const session = envelope.data;

  // The per-prescription Superset layout (ADR-0023): a saved Superset (from a
  // Hand-Authored Session or an AI plan) renders as a lettered, round-rest-bearing group
  // here. Derived from the ordered prescriptions' group tags via the shared vocabulary.
  const supersetSlots = supersetLayout(
    session.prescriptions.map((prescription) => ({
      supersetGroup: prescription.superset_group ?? null,
      roundRestSeconds: prescription.round_rest_seconds ?? null,
    })),
  );

  // Read the harder-Variation offer per prescription (#202). The endpoint returns
  // `null` for anything not at a pure-bodyweight rep ceiling, so most resolve to no
  // offer; a failed read simply shows none. Fetched in parallel to keep the page fast.
  const offers = await Promise.all(
    session.prescriptions.map(async (prescription) => {
      const offer = await fetchHarderVariation(session.id, prescription.position);
      return toHarderVariationOffer(
        offer.success && offer.data ? offer.data.suggested_variation : null,
      );
    }),
  );

  return (
    <section className="flex flex-col gap-7">
      <PageHeader
        overline="PULSE // SESSION"
        title={<span className="capitalize">{session.training_type}</span>}
        action={<Badge variant="cyan">{session.duration_minutes} MIN</Badge>}
      />

      <div className="flex flex-col gap-4">
        <SectionHeader meta={`${session.prescriptions.length} EXERCISES`}>
          PROTOCOL
        </SectionHeader>
        <ol className="flex list-none flex-col gap-3 p-0">
          {session.prescriptions.map((prescription, index) => (
            <li key={prescription.position}>
              <PrescriptionCard
                prescription={prescription}
                superset={supersetSlots[index]}
                sessionId={session.id}
                index={index + 1}
                harderVariation={offers[index]}
              />
            </li>
          ))}
        </ol>
        {/* Insert (ADR-0051, issue #360): hand-author one new movement onto the end of a
            standalone Session. Withheld on a Protocol-member Session — adding inside a Protocol
            stays the Builder's tail-gated Deploy path (standalone-only, ADR-0051), mirroring how
            Duplicate is withheld there. */}
        {session.is_protocol_member ? null : (
          <AddExerciseButton sessionId={session.id} />
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <Link
          href={`/sessions/${session.id}/live`}
          className={buttonVariants({ className: "w-full" })}
        >
          <Play className="h-4 w-4" />
          Start session
        </Link>
        <Link
          href={`/sessions/${session.id}/log`}
          className={buttonVariants({
            variant: "secondary",
            className: "w-full",
          })}
        >
          <ClipboardCheck className="h-4 w-4" />
          Log this session
        </Link>
        {/* Duplicate is withheld on a Protocol member (ADR-0043 consequence, Q2): lifting
            one workout out of a plan the user is working through has no value here. It
            stays on standalone Sessions, where forking a separate editable copy is the
            actual intent. */}
        {session.is_protocol_member ? null : (
          <DuplicateButton sessionId={session.id} />
        )}
        <Link
          href="/sessions/new"
          className={buttonVariants({
            variant: "secondary",
            className: "w-full",
          })}
        >
          Generate another
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

function PrescriptionCard({
  prescription,
  superset,
  sessionId,
  index,
  harderVariation,
}: {
  prescription: ExercisePrescription;
  superset: SupersetSlot | undefined;
  sessionId: number;
  index: number;
  harderVariation: HarderVariationOfferView;
}) {
  // A grouped Prescription rests once per round at the group level, so its own rest is
  // dormant and the round-rest is shown once, on the group's last member (ADR-0023).
  const isGrouped = superset !== undefined && superset.group !== null;
  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-base font-mono text-[13px] font-bold text-cyan">
          {String(index).padStart(2, "0")}
        </span>
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={appendFrom(
                `/exercises/${prescription.exercise_id}`,
                `/sessions/${sessionId}`,
              )}
              className="font-display text-[15px] font-semibold text-text-primary transition-colors hover:text-cyan"
            >
              {prescription.exercise_name}
            </Link>
            {isGrouped ? (
              <Badge variant="cyan" title="Performed round-major within a superset">
                SUPERSET {superset.memberLabel}
              </Badge>
            ) : null}
            {prescription.provenance === "ai_generated" ? (
              <Badge
                variant="magenta"
                title="AI-generated, not yet reviewed"
              >
                AI-GENERATED
              </Badge>
            ) : null}
          </div>
          {prescription.exercise_description ? (
            <p className="font-sans text-[13px] leading-relaxed text-text-secondary">
              {prescription.exercise_description}
            </p>
          ) : null}
        </div>
      </div>

      <DataList
        rows={[
          {
            label: "Sets × reps",
            value: `${prescription.sets} × ${prescription.reps}`,
          },
          ...(prescription.recommended_load
            ? [{ label: "Load", value: prescription.recommended_load.text }]
            : []),
          // A solo Prescription shows its own rest; a grouped one shows the group-owned
          // round-rest once (on the last member), its individual rest being dormant.
          ...(!isGrouped && prescription.rest_seconds !== null
            ? [{ label: "Rest", value: `${prescription.rest_seconds}s` }]
            : []),
          ...(isGrouped &&
          superset.isLastMember &&
          superset.roundRestSeconds !== null
            ? [{ label: "Round rest", value: `${superset.roundRestSeconds}s` }]
            : []),
          ...tempoRows(toTempoView(prescription.tempo)),
          ...(prescription.targeted_muscles.length > 0
            ? [
                {
                  label: "Muscles",
                  value: prescription.targeted_muscles.join(", "),
                },
              ]
            : []),
        ]}
      />

      <HarderVariationOffer
        sessionId={sessionId}
        position={prescription.position}
        offer={harderVariation}
      />

      <SubstituteButton sessionId={sessionId} position={prescription.position} />
    </Card>
  );
}

// The Tempo row(s) for the prescription's DataList — a read-time projection of the
// stored free-form tempo string (CONTEXT: Tempo). A parsed tempo shows its coarse
// three-state label over the plain-language phase expansion, keeping the cryptic raw
// code on hover (`title`) and a naturally-spoken `aria-label` for screen readers; an
// unparseable value is shown verbatim; an absent tempo renders no row at all.
function tempoRows(view: TempoView): { label: string; value: ReactNode }[] {
  if (view.kind === "none") return [];
  if (view.kind === "raw") return [{ label: "Tempo", value: view.raw }];
  return [
    {
      label: "Tempo",
      value: (
        <span
          className="flex flex-col items-end"
          title={view.raw}
          aria-label={view.ariaLabel}
        >
          <span>{view.label}</span>
          <span className="text-[11px] font-normal text-text-muted">
            {view.expansion}
          </span>
        </span>
      ),
    },
  ];
}

export type { WorkoutSession };
