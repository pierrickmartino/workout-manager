import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ClipboardCheck, Play } from "lucide-react";

import { SubstituteButton } from "@/components/SubstituteButton";
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
        <SectionHeader meta={`${session.prescriptions.length} MODULES`}>
          PROTOCOL
        </SectionHeader>
        <ol className="flex list-none flex-col gap-3 p-0">
          {session.prescriptions.map((prescription, index) => (
            <li key={prescription.position}>
              <PrescriptionCard
                prescription={prescription}
                sessionId={session.id}
                index={index + 1}
                harderVariation={offers[index]}
              />
            </li>
          ))}
        </ol>
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
  sessionId,
  index,
  harderVariation,
}: {
  prescription: ExercisePrescription;
  sessionId: number;
  index: number;
  harderVariation: HarderVariationOfferView;
}) {
  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-base font-mono text-[13px] font-bold text-cyan">
          {String(index).padStart(2, "0")}
        </span>
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/exercises/${prescription.exercise_id}`}
              className="font-display text-[15px] font-semibold text-text-primary transition-colors hover:text-cyan"
            >
              {prescription.exercise_name}
            </Link>
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
          ...(prescription.rest_seconds !== null
            ? [{ label: "Rest", value: `${prescription.rest_seconds}s` }]
            : []),
          ...(prescription.tempo
            ? [{ label: "Tempo", value: prescription.tempo }]
            : []),
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

export type { WorkoutSession };
