import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ClipboardCheck, Play } from "lucide-react";

import { SubstituteButton } from "@/components/SubstituteButton";
import { DuplicateButton } from "@/components/DuplicateButton";
import { AddExerciseButton } from "@/components/AddExerciseButton";
import { RemoveExerciseButton } from "@/components/RemoveExerciseButton";
import { HarderVariationOffer } from "@/components/HarderVariationOffer";
import { PinControl } from "@/components/PinControl";
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
import { displayReps, pinControlModel, type PinControlModel } from "@/lib/pin-view";
import { toTempoView, type TempoView } from "@/lib/tempo-view";
import { supersetLayout, type SupersetSlot } from "@/lib/supersets";
import { removeAffordances } from "@/lib/remove-prescription";
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pin?: string; reps?: string }>;
}) {
  const { id } = await params;
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId)) notFound();

  // The Pin offer hand-off from the log flow (ADR-0053, #371): confirming the post-log Pin offer
  // lands here as `?pin=<position>&reps=<proposed>`, so the matching movement's Pin editor opens
  // pre-filled with the proposed range. Absent on a normal plan view, where pinning is opt-in.
  const { pin: pinParam, reps: pinReps } = await searchParams;
  const pinPosition = pinParam !== undefined ? Number(pinParam) : null;

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

  // The per-row Remove affordance (ADR-0052): standalone-only (withheld on a Protocol
  // member), disabled on the last remaining movement, and flagging a two-member Superset
  // so the confirm warns that removing one member dissolves its partner (Q4/Q8/Q9).
  const removeAffordanceList = removeAffordances(
    session.prescriptions,
    session.is_protocol_member ?? false,
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
                pinModel={pinControlModel(prescription)}
                displayReps={displayReps(prescription)}
                pinAutoOpen={pinPosition === prescription.position}
                pinInitialReps={
                  pinPosition === prescription.position ? pinReps : undefined
                }
                showRemove={removeAffordanceList[index].showRemove}
                canRemove={removeAffordanceList[index].canRemove}
                dissolvesSuperset={removeAffordanceList[index].dissolvesSuperset}
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
  pinModel,
  displayReps,
  pinAutoOpen,
  pinInitialReps,
  showRemove,
  canRemove,
  dissolvesSuperset,
}: {
  prescription: ExercisePrescription;
  superset: SupersetSlot | undefined;
  sessionId: number;
  index: number;
  harderVariation: HarderVariationOfferView;
  // The plan-view Pin state for this movement (ADR-0053): a pinned range surfaced verbatim with
  // an un-pin control, a pinnable pure-bodyweight movement, or none. `displayReps` is the reps to
  // show — the Pinned Target when set, else the prescribed reps.
  pinModel: PinControlModel;
  displayReps: string;
  pinAutoOpen: boolean;
  pinInitialReps: string | undefined;
  showRemove: boolean;
  canRemove: boolean;
  dissolvesSuperset: boolean;
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
            // The Pinned Target is what the user sees (ADR-0053, user story 20): when pinned, the
            // stored range is surfaced verbatim with a PINNED marker; otherwise the prescribed reps.
            value:
              pinModel.kind === "pinned" ? (
                <span className="flex items-center gap-2">
                  {`${prescription.sets} × ${displayReps}`}
                  <Badge variant="cyan" title="Automatic progression is suspended for this movement">
                    PINNED
                  </Badge>
                </span>
              ) : (
                `${prescription.sets} × ${displayReps}`
              ),
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

      {/* Pin (ADR-0053, #371): reflect a Pinned Target with an un-pin control, or offer to pin a
          rep target on a pure-bodyweight movement. Nothing renders for a non-pinnable movement. */}
      <PinControl
        sessionId={sessionId}
        position={prescription.position}
        model={pinModel}
        autoOpen={pinAutoOpen}
        initialReps={pinInitialReps}
      />

      <div className="flex flex-wrap items-center gap-3">
        <SubstituteButton sessionId={sessionId} position={prescription.position} />
        {/* Remove (ADR-0052): withdraw this movement from a standalone Session — Insert's
            symmetric partner. Withheld on a Protocol member (removing inside a Protocol
            stays Deploy's job), and disabled on the last remaining movement (a Session must
            keep at least one). */}
        {showRemove ? (
          <RemoveExerciseButton
            sessionId={sessionId}
            position={prescription.position}
            canRemove={canRemove}
            dissolvesSuperset={dissolvesSuperset}
          />
        ) : null}
      </div>
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
