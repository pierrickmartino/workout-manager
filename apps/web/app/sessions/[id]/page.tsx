import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ClipboardCheck, Play } from "lucide-react";

import { SubstituteButton } from "@/components/SubstituteButton";
import { DuplicateButton } from "@/components/DuplicateButton";
import { RenameSessionControl } from "@/components/RenameSessionControl";
import { FavoriteSessionControl } from "@/components/FavoriteSessionControl";
import { ShareSessionControl } from "@/components/ShareSessionControl";
import { DeleteSessionControl } from "@/components/DeleteSessionControl";
import { AddExerciseButton } from "@/components/AddExerciseButton";
import { resolveAppearance } from "@/lib/appearance";
import { formatLoad } from "@/lib/load";
import type { WeightUnit } from "@/lib/weight-unit";
import { RemoveExerciseButton } from "@/components/RemoveExerciseButton";
import { HarderVariationOffer } from "@/components/HarderVariationOffer";
import { SchemeControl } from "@/components/SchemeControl";
import { schemeControlModel, type SchemeControlModel } from "@/lib/scheme-view";
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
import { removeAffordances } from "@/lib/remove-prescription";
import { sessionNameView } from "@/lib/session-name";
import { sessionAuthorView } from "@/lib/session-author";
import { sessionFavoriteView } from "@/lib/session-favorite";
import { sessionDeleteView, DELETE_DISABLED_HINT } from "@/lib/session-delete";
import { submitDeleteSession } from "@/app/sessions/[id]/actions";
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

  const [envelope, appearance] = await Promise.all([
    fetchSession(sessionId),
    resolveAppearance(),
  ]);
  if (!envelope.success || !envelope.data) {
    notFound();
  }

  const session = envelope.data;
  const unit = appearance.weight_unit;

  // The Session Name view (issue #394): the header shows the user-given name when set, else
  // the derived `training_type · date` fallback so an unnamed Session is never blank. The
  // rename control is withheld on a Protocol member below (Session Name is standalone-only).
  const nameView = sessionNameView(session);

  // The Author byline (CONTEXT: Author, issue #395): "by <name>", crediting the human who first
  // created this plan. Rendered under the title as quiet secondary text — deliberately distinct
  // from the per-movement AI-GENERATED Provenance badges (who made it vs. how it was made).
  const authorView = sessionAuthorView(session);

  // The Favorite toggle state (CONTEXT: Favorite, issue #396): whether this standalone Session is
  // favorited, and whether to show the toggle at all. Withheld on a Protocol member (the server
  // sends `null`), where `show` is false — Favorite is a standalone-only concept, like the Session
  // Name — so the control is hidden alongside Rename below.
  const favoriteView = sessionFavoriteView(session);

  // The Delete control state (CONTEXT: Delete, ADR-0063): whether to show Delete at all
  // (standalone-only, and only when the detail read carried the Logged Count) and whether the
  // Session may be deleted now (only with no logged training). Shown disabled with a hint when
  // the Session has been performed — the server 409 is the backstop.
  const deleteView = sessionDeleteView(session);

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
        title={nameView.displayName}
        action={
          <div className="flex items-center gap-2">
            <Badge variant="magenta" className="capitalize">
              {session.training_type}
            </Badge>
            <Badge variant="cyan">{session.duration_minutes} MIN</Badge>
          </div>
        }
      />

      {/* Author (issue #395): credit the human who first created this plan, "by <name>". Quiet
          secondary text so it reads as attribution, kept visually distinct from the magenta
          AI-GENERATED Provenance badges on each movement (who made it vs. how it was made). A
          generic-label fallback (unnamed author) is shown muted/italic to read as a placeholder. */}
      <p
        className={`-mt-4 font-sans text-[13px] ${
          authorView.isNamed ? "text-text-secondary" : "text-text-muted italic"
        }`}
      >
        {authorView.byline}
      </p>

      {/* Standalone-only header controls. Both Rename and Favorite are withheld on a Protocol
          member — a Session inside a Protocol carries a Week/Day `title` and is server-refused for
          both (mirrors Duplicate/Insert). */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Rename (issue #394): name, rename, or clear the Session Name on a standalone Session. */}
        {session.is_protocol_member ? null : (
          <RenameSessionControl
            sessionId={session.id}
            displayName={nameView.displayName}
            isUserNamed={nameView.isUserNamed}
            editValue={nameView.editValue}
          />
        )}
        {/* Favorite (issue #396): mark/unmark this standalone Session as a Favorite — a stored,
            per-user, per-copy preference used to filter My Sessions. Hidden here on a Protocol
            member (`favoriteView.show` is false, the server withholds the marker). */}
        {favoriteView.show ? (
          <FavoriteSessionControl
            sessionId={session.id}
            isFavorite={favoriteView.isFavorite}
          />
        ) : null}
        {/* Share (ADR-0057, issue #398): publish a revocable Share Link another user can Redeem
            into their own independent copy. Standalone-only — withheld on a Protocol member (a
            Share Link is offered on standalone Sessions only), alongside Rename/Favorite. */}
        {session.is_protocol_member ? null : (
          <ShareSessionControl sessionId={session.id} />
        )}
        {/* Delete (CONTEXT: Delete, ADR-0063): permanently remove this standalone Session, offered
            only when it has no logged training. Shown here disabled with a hint when the Session has
            been performed (deleteView.canDelete false); hidden entirely on a Protocol member or a
            read that omits the Logged Count (deleteView.show false), alongside Rename/Favorite/Share. */}
        {deleteView.show ? (
          <DeleteSessionControl
            sessionId={session.id}
            action={submitDeleteSession}
            disabledHint={deleteView.canDelete ? null : DELETE_DISABLED_HINT}
          />
        ) : null}
      </div>

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
                unit={unit}
                index={index + 1}
                harderVariation={offers[index]}
                schemeModel={schemeControlModel(prescription)}
                showScheme={!(session.is_protocol_member ?? false)}
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
          <AddExerciseButton sessionId={session.id} unit={unit} />
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
  unit,
  index,
  harderVariation,
  schemeModel,
  showScheme,
  showRemove,
  canRemove,
  dissolvesSuperset,
}: {
  prescription: ExercisePrescription;
  superset: SupersetSlot | undefined;
  sessionId: number;
  unit: WeightUnit;
  index: number;
  harderVariation: HarderVariationOfferView;
  // The plan-view Progression Scheme state for this movement (ADR-0064): the current scheme
  // and the compatible alternatives to offer. `showScheme` is false on a Protocol member,
  // whose scheme is chosen on the Builder and committed via Deploy (standalone-only in place).
  schemeModel: SchemeControlModel;
  showScheme: boolean;
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
            // The reps the read-time overlay resolved for this movement — the scheme-stepped
            // target (Static holds the authored value; the default steps it), never a stored
            // number (ADR-0064).
            label: "Sets × reps",
            value: `${prescription.sets} × ${prescription.reps}`,
          },
          ...(prescription.recommended_load
            ? [{ label: "Load", value: formatLoad(prescription.recommended_load, unit) }]
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

      {/* Progression Scheme (ADR-0064, #432): choose how this movement's un-performed tail
          steps, offering only schemes compatible with its Load. Standalone-only — a Protocol
          member's scheme is chosen on the Builder and committed via Deploy. */}
      {showScheme ? (
        <SchemeControl
          sessionId={sessionId}
          position={prescription.position}
          model={schemeModel}
        />
      ) : null}

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
