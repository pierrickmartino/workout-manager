import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronRight, ClipboardCheck, Pencil, Play } from "@/components/pulse/icons";

import { SubstituteButton } from "@/components/SubstituteButton";
import { EquipmentSubstitutionSheet } from "@/components/EquipmentSubstitutionSheet";
import { RestoreOriginalButton } from "@/components/RestoreOriginalButton";
import { WarmUpSuggestion } from "@/components/WarmUpSuggestion";
import { DuplicateButton } from "@/components/DuplicateButton";
import { RenameSessionControl } from "@/components/RenameSessionControl";
import { SessionActionsSheet } from "@/components/SessionActionsSheet";
import { SessionDetailHeader } from "@/components/SessionDetailHeader";
import { ShareSessionControl } from "@/components/ShareSessionControl";
import { DeleteSessionControl } from "@/components/DeleteSessionControl";
import { AddExerciseButton } from "@/components/AddExerciseButton";
import { ActionSheet } from "@/components/pulse/action-sheet";
import {
  ActionSheetItemText,
  ActionSheetSeparator,
  actionSheetItemClass,
} from "@/components/pulse/action-sheet-item";
import { resolveAppearance } from "@/lib/appearance";
import { fetchProfile } from "@/lib/profile";
import type { WeightUnit } from "@/lib/weight-unit";
import { RemoveExerciseButton } from "@/components/RemoveExerciseButton";
import { HarderVariationOffer } from "@/components/HarderVariationOffer";
import { SchemeControl } from "@/components/SchemeControl";
import { schemeControlModel, type SchemeControlModel } from "@/lib/scheme-view";
import { prescriptionSetTypeBadge } from "@/lib/set-type-view";
import { targetEffortLabel } from "@/lib/target-effort-view";
import { exerciseNoteText } from "@/lib/note-view";
import {
  fetchHarderVariations,
  fetchSession,
  type ExercisePrescription,
  type WorkoutSession,
} from "@/lib/sessions";
import {
  harderVariationOffersFor,
  type HarderVariationOffer as HarderVariationOfferView,
} from "@/lib/harder-variation-view";
import { toTempoView, type TempoView } from "@/lib/tempo-view";
import { prescriptionPlanView } from "@/lib/prescription-plan-view";
import { schemeNextStep } from "@/lib/scheme-next-step";
import { PrescriptionSetTable } from "@/components/prescription-set-table";
import { supersetLayout, type SupersetSlot } from "@/lib/supersets";
import { removeAffordances } from "@/lib/remove-prescription";
import { sessionNameView } from "@/lib/session-name";
import { sessionAuthorView } from "@/lib/session-author";
import { BasedOnNote } from "@/components/BasedOnNote";
import { sessionFavoriteView } from "@/lib/session-favorite";
import { sessionDeleteView, DELETE_DISABLED_HINT } from "@/lib/session-delete";
import { sessionEditView } from "@/lib/session-edit";
import { substituteView } from "@/lib/substitute-view";
import { restoreOriginalView } from "@/lib/restore-original-view";
import { submitDeleteSession } from "@/app/sessions/[id]/actions";
import { appendFrom } from "@/lib/back-target";
import { Skeleton } from "@/components/pulse/skeleton";
import { SkeletonReveal } from "@/components/pulse/skeleton-reveal";
import { SectionHeader } from "@/components/pulse/section-header";
import { DataList } from "@/components/pulse/data-list";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { NAV_FORWARD } from "@/lib/nav-direction";

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

  // The Author byline (GLOSSARY: Author, issue #395): "by <name>", crediting the human who first
  // created this plan. Rendered under the title as quiet secondary text — deliberately distinct
  // from the per-movement AI-GENERATED Provenance badges (who made it vs. how it was made).
  const authorView = sessionAuthorView(session);

  // The Favorite state (GLOSSARY: Favorite, issue #396): whether this standalone Session is
  // favorited, and whether to offer the toggle at all. Withheld on a Protocol member (the server
  // sends `null`), where `show` is false — Favorite is a standalone-only concept, like the Session
  // Name — so the sheet has no Favorite row there, alongside the withheld Rename.
  const favoriteView = sessionFavoriteView(session);

  // The Delete control state (GLOSSARY: Delete, ADR-0063): whether to show Delete at all
  // (standalone-only, and only when the detail read carried the Logged Count) and whether the
  // Session may be deleted now (only with no logged training). Shown disabled with a hint when
  // the Session has been performed — the server 409 is the backstop.
  const deleteView = sessionDeleteView(session);

  // The Edit entry (ADR-0133): standalone-only, like Insert and Remove.
  const editView = sessionEditView(session);

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

  return (
    <section className="flex flex-col gap-7">
      <SessionDetailHeader
        session={session}
        displayName={nameView.displayName}
        authorView={authorView}
        isFavorite={favoriteView.isFavorite}
        menu={
          // The ⋯ action sheet, pinned top right on the overline's line (ADR-0133). Favorite is its
          // first row; the rare and destructive actions (Rename, Share, Duplicate, Generate
          // another, Delete) follow, one tap behind it, so the primary Start / Log verbs dominate
          // the page (docs/redesign-ia.md, ADR-0071, ADR-0113). Each control is standalone-only
          // unless noted; on a Protocol member the sheet holds only "Generate another".
          <SessionActionsSheet
            sessionId={session.id}
            // Favorite (issue #396): a stored, per-user, per-copy preference used to filter My
            // Sessions. No row on a Protocol member (`favoriteView.show` is false, the server
            // withholds the marker).
            isFavorite={favoriteView.show ? favoriteView.isFavorite : null}
          >
            {/* Rename (issue #394): name, rename, or clear the Session Name on a standalone Session. */}
            {session.is_protocol_member ? null : (
              <RenameSessionControl
                sessionId={session.id}
                displayName={nameView.displayName}
                isUserNamed={nameView.isUserNamed}
                editValue={nameView.editValue}
              />
            )}
            {/* Share (ADR-0057, issue #398): publish a revocable Share Link another user can Redeem
                into their own independent copy. Standalone-only. */}
            {session.is_protocol_member ? null : (
              <ShareSessionControl sessionId={session.id} />
            )}
            {/* Duplicate is withheld on a Protocol member (ADR-0043 consequence): lifting one
                workout out of a plan the user is working through has no value. It stays on
                standalone Sessions, where forking a separate editable copy is the actual intent. */}
            {session.is_protocol_member ? null : (
              <DuplicateButton sessionId={session.id} />
            )}
            {/* Generate another standalone Session — a periodic action, not a per-session verb. */}
            <Link
              {...NAV_FORWARD}
              href={appendFrom("/sessions/new", `/sessions/${session.id}`)}
              className={actionSheetItemClass()}
            >
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
              <ActionSheetItemText
                label="Generate another"
                description="Ask for a new standalone session"
              />
            </Link>
            {/* Delete (GLOSSARY: Delete, ADR-0063): permanently remove this standalone Session,
                offered only when it has no logged training. Shown disabled, with the reason as its
                description, when the Session has been performed (deleteView.canDelete false);
                hidden entirely on a Protocol member or a read that omits the Logged Count
                (deleteView.show false). Last in the sheet, below a rule — the one destructive
                action, and a two-step confirm deeper than the rest. */}
            {deleteView.show ? (
              <>
                <ActionSheetSeparator />
                <DeleteSessionControl
                  sessionId={session.id}
                  action={submitDeleteSession}
                  disabledHint={deleteView.canDelete ? null : DELETE_DISABLED_HINT}
                />
              </>
            ) : null}
          </SessionActionsSheet>
        }
      />

      {/* Curated lineage (ADR-0130, #688): "Based on <name>" for a plan adopted from a Curated
          Protocol, kept through Duplicate and Redeem; nothing otherwise. */}
      <BasedOnNote lineage={session.curated_lineage} />

      <div className="flex flex-col gap-4">
        <SectionHeader meta={`${session.prescriptions.length} EXERCISES`}>
          PROTOCOL
        </SectionHeader>
        {/* Warm-up Suggestion (ADR-0143): preview AI warm-up drills for this Session's muscles.
            Hidden once the Session has been performed; the preview never changes the plan. */}
        <WarmUpSuggestion session={session} unit={unit} />
        {/* The cards wait on the harder-Variation offer read; everything above and below them needs
            only the Session read, so the header — and its sigil — commits with the navigation and
            can morph from the surface the reader tapped (ADR-0120). One placeholder per movement
            keeps the page from jumping when the cards arrive. */}
        <Suspense fallback={<PrescriptionListSkeleton count={session.prescriptions.length} />}>
          <PrescriptionList
            session={session}
            unit={unit}
            supersetSlots={supersetSlots}
            removeAffordanceList={removeAffordanceList}
          />
        </Suspense>
        {/* Insert (ADR-0051, issue #360): hand-author one new movement onto the end of a
            standalone Session. Withheld on a Protocol-member Session — adding inside a Protocol
            stays the Builder's tail-gated Deploy path (standalone-only, ADR-0051), mirroring how
            Duplicate is withheld there. */}
        {session.is_protocol_member ? null : (
          <AddExerciseButton sessionId={session.id} unit={unit} />
        )}
        {/* Edit (ADR-0133): open this standalone Session's whole plan in the Hand-Authored
            editor — reorder, sets, reps, rest, load — and save it back in place. Withheld on a
            Protocol member, whose Sessions are edited through the Builder's Deploy. */}
        {editView.show ? (
          <Link
            {...NAV_FORWARD}
            href={editView.href}
            className={buttonVariants({ variant: "secondary", className: "w-full" })}
          >
            <Pencil className="h-4 w-4" aria-hidden />
            Edit exercises
          </Link>
        ) : null}
      </div>

      {/* The primary verbs: Start and Log. Rare actions (Duplicate, Generate another) moved
          into the header "⋯ More" disclosure so this block stays focused (ADR-0071). */}
      <div className="flex flex-col gap-2.5">
        <Link
          {...NAV_FORWARD}
          href={`/sessions/${session.id}/live`}
          className={buttonVariants({ className: "w-full" })}
        >
          <Play className="h-4 w-4" />
          Start session
        </Link>
        <Link
          {...NAV_FORWARD}
          href={`/sessions/${session.id}/log`}
          className={buttonVariants({
            variant: "secondary",
            className: "w-full",
          })}
        >
          <ClipboardCheck className="h-4 w-4" />
          Log this session
        </Link>
      </div>
    </section>
  );
}

// The Exercise Prescription cards, streamed behind the page's header. Reads every
// prescription's harder-Variation offer (#202) in one request (audit V-5): the backend returns
// `null` for anything not at a pure-bodyweight rep ceiling, so most resolve to no offer, and a
// failed read — envelope or transport — simply shows none. It is still the slowest read on the
// page, which is why it does not hold the header back.
async function PrescriptionList({
  session,
  unit,
  supersetSlots,
  removeAffordanceList,
}: {
  session: WorkoutSession;
  unit: WeightUnit;
  supersetSlots: readonly (SupersetSlot | undefined)[];
  removeAffordanceList: ReturnType<typeof removeAffordances>;
}) {
  // The Default Equipment pre-fills each Substitute picker (ADR-0143); a failed Profile read
  // leaves the picker empty (Bodyweight only) rather than blocking the page.
  const [envelope, profile] = await Promise.all([
    fetchHarderVariations(session.id).catch(() => null),
    fetchProfile().catch(() => null),
  ]);
  const defaultEquipment =
    profile?.success && profile.data ? profile.data.default_equipment_canonical : [];
  const offers = harderVariationOffersFor(
    session.prescriptions.map((prescription) => prescription.position),
    envelope?.success && envelope.data ? envelope.data.offers : null,
  );
  // Substitute (and accepting a harder Variation, which is a Substitution) is withheld on a
  // performed Protocol Session — settled history (#787, ADR-0020); the server 409 backstops it.
  const { show: showSubstitute } = substituteView(session);

  return (
    <div className="flex flex-col gap-3">
      {/* Equipment Substitution (ADR-0143, #791): substitute every exercise the equipment at hand
          blocks, in this Session only. Offered where Substitute is; locked by a Live Session. */}
      <EquipmentSubstitutionSheet
        sessionId={session.id}
        showSubstitute={showSubstitute}
        defaultEquipment={defaultEquipment}
      />
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
              showSubstitute={showSubstitute}
              showRemove={removeAffordanceList[index].showRemove}
              canRemove={removeAffordanceList[index].canRemove}
              dissolvesSuperset={removeAffordanceList[index].dissolvesSuperset}
              defaultEquipment={defaultEquipment}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

// Stands in for the cards while the offers load: same list, same gap, one block per movement.
// It dissolves over the cards when they arrive (ADR-0123).
function PrescriptionListSkeleton({ count }: { count: number }) {
  return (
    <SkeletonReveal>
      <div className="flex flex-col gap-3">
        {Array.from({ length: count }, (_, index) => (
          <Skeleton key={index} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    </SkeletonReveal>
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
  showSubstitute,
  showRemove,
  canRemove,
  dissolvesSuperset,
  defaultEquipment,
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
  showSubstitute: boolean;
  showRemove: boolean;
  canRemove: boolean;
  dissolvesSuperset: boolean;
  defaultEquipment: readonly string[];
}) {
  // The plan read like the Live Session's set table (ADR-0114): a summary line and one row per
  // set, rest following the Superset rule (ADR-0023). The NEXT row under it is the applied
  // scheme's next step — the change, never a value, since stepping reads the record (ADR-0066).
  const isGrouped = superset !== undefined && superset.group !== null;
  const plan = prescriptionPlanView(prescription, superset, unit);
  const next = schemeNextStep(schemeModel.current, schemeModel.reps, schemeModel.load);
  const note = exerciseNoteText(prescription);
  const setType = prescriptionSetTypeBadge(prescription);
  const effort = targetEffortLabel(prescription);
  const restore = restoreOriginalView(prescription, { canSubstitute: showSubstitute });
  const hasBadges =
    isGrouped || prescription.provenance === "ai_generated" || setType !== null || effort !== null;
  return (
    <Card className="flex flex-col gap-3 p-3">
      <div className="flex items-start gap-2.5">
        <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-sm bg-base px-1 font-mono text-[11px] font-bold text-cyan">
          {String(index).padStart(2, "0")}
        </span>
        <div className="flex min-w-0 grow flex-col gap-1">
          <Link
            {...NAV_FORWARD}
            href={appendFrom(
              `/exercises/${prescription.exercise_id}`,
              `/sessions/${sessionId}`,
            )}
            className="break-words text-pretty font-display text-[15px] font-semibold leading-tight text-text-primary transition-colors hover:text-cyan"
          >
            {prescription.exercise_name}
          </Link>
          <p className="font-mono text-[11px] text-text-muted">{plan.summary}</p>
          {hasBadges ? (
            <div className="flex flex-wrap gap-1.5">
              {isGrouped ? (
                <Badge variant="cyan" title="Performed round-major within a superset">
                  SUPERSET {superset.memberLabel}
                </Badge>
              ) : null}
              {/* Set Type (ADR-0065) and Target Effort (ADR-0066): descriptive plan labels, shown
                  only when set, so a plain working movement stays quiet. */}
              {setType ? (
                <Badge variant="violet" title="Set Type">
                  {setType.label}
                </Badge>
              ) : null}
              {effort ? (
                <Badge variant="violet" title="Target Effort">
                  {effort}
                </Badge>
              ) : null}
              {prescription.provenance === "ai_generated" ? (
                <Badge variant="magenta" title="AI-generated, not yet reviewed">
                  AI-GENERATED
                </Badge>
              ) : null}
            </div>
          ) : null}
          {/* Exercise Note (ADR-0065, #451): the plan-side coaching cue stays in view — it is
              read before the set, not looked up. React renders the decoded value as inert text. */}
          {note ? (
            <p
              className="font-sans text-[13px] italic leading-relaxed text-text-secondary"
              title="Exercise Note"
            >
              “{note}”
            </p>
          ) : null}
        </div>
      </div>

      <PrescriptionSetTable name={prescription.exercise_name} view={plan} next={next} />

      {showSubstitute ? (
        <HarderVariationOffer
          sessionId={sessionId}
          position={prescription.position}
          offer={harderVariation}
        />
      ) : null}

      {/* Progression Scheme (ADR-0064, #432): choose how this movement's un-performed tail
          steps, offering only schemes compatible with its Load. Standalone-only — a Protocol
          member's scheme is chosen on the Builder and committed via Deploy; there the NEXT row
          above still says what its scheme does. */}
      {showScheme ? (
        <SchemeControl
          sessionId={sessionId}
          position={prescription.position}
          name={prescription.exercise_name}
          model={schemeModel}
        />
      ) : null}

      <AboutExercise prescription={prescription} />

      <div className="flex flex-wrap items-center gap-3">
        {/* Substitute stays on the primary surface — an in-context, non-destructive edit. */}
        {showSubstitute ? (
          <SubstituteButton
            sessionId={sessionId}
            position={prescription.position}
            defaultEquipment={defaultEquipment}
          />
        ) : null}
        {/* Restore original (ADR-0143, #788): once substituted, put back the Prescribed
            Original's Exercise, Load and scheme — offered only where Substitute is. */}
        {restore.show ? (
          <RestoreOriginalButton
            sessionId={sessionId}
            position={prescription.position}
            view={restore}
          />
        ) : null}
        {/* Remove (ADR-0052): withdraw this movement from a standalone Session — Insert's
            symmetric partner. Destructive, so demoted one tap behind a per-row action sheet
            (docs/redesign-ia.md, ADR-0071, ADR-0113). The sheet is rendered only when Remove is
            offered — withheld on a Protocol member (removing inside a Protocol stays Deploy's
            job), so most rows carry no ⋯ at all. Every row's trigger names its movement. */}
        {showRemove ? (
          <ActionSheet
            label={`More actions for ${prescription.exercise_name}`}
            title={prescription.exercise_name}
          >
            <RemoveExerciseButton
              sessionId={sessionId}
              position={prescription.position}
              canRemove={canRemove}
              dissolvesSuperset={dissolvesSuperset}
            />
          </ActionSheet>
        ) : null}
      </div>
    </Card>
  );
}

// The reference detail a user looks up rather than reads before every set — the description,
// Tempo and targeted muscles — folded behind one disclosure so the set table leads the card.
// Renders nothing when the movement carries none of them.
function AboutExercise({ prescription }: { prescription: ExercisePrescription }) {
  const tempo = toTempoView(prescription.tempo);
  const muscles = prescription.targeted_muscles;
  if (!prescription.exercise_description && tempo.kind === "none" && muscles.length === 0) {
    return null;
  }
  return (
    <details className="group">
      <summary className="label-mono flex min-h-9 cursor-pointer list-none items-center gap-1 text-[9px] text-text-muted">
        <ChevronRight
          className="h-3 w-3 transition-transform group-open:rotate-90 motion-reduce:transition-none"
          aria-hidden
        />
        About this exercise
      </summary>
      <div className="flex flex-col gap-1.5 pt-1">
        {prescription.exercise_description ? (
          <p className="font-sans text-[13px] leading-relaxed text-text-secondary">
            {prescription.exercise_description}
          </p>
        ) : null}
        <DataList
          rows={[
            ...tempoRows(tempo),
            ...(muscles.length > 0 ? [{ label: "Muscles", value: muscles.join(", ") }] : []),
          ]}
        />
      </div>
    </details>
  );
}

// The Tempo row(s) for the prescription's DataList — a read-time projection of the
// stored free-form tempo string (GLOSSARY: Tempo). A parsed tempo shows its coarse
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
