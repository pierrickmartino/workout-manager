import { notFound, redirect } from "next/navigation";

import { fetchSession } from "@/lib/sessions";
import { fetchProfile } from "@/lib/profile";
import { resolveAppearance } from "@/lib/appearance";
import { editSeedFromSession, sessionEditView } from "@/lib/session-edit";
import { sessionNameView } from "@/lib/session-name";
import { EditSessionPlanForm } from "@/components/EditSessionPlanForm";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";

interface EditSessionPageProps {
  params: Promise<{ id: string }>;
}

// Edit a standalone Session in place (ADR-0133). Loads the Session server-side (owner-scoped:
// anyone else's 404s), folds it into the Hand-Authored editor's seed, and saves the edited
// plan back over it. A Protocol member is edited through its Protocol's Builder instead
// (tail-gated Deploy, ADR-0020), so it is sent back to its detail page.
export default async function EditSessionPage({ params }: EditSessionPageProps) {
  const { id } = await params;
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId)) notFound();

  const [envelope, profileEnvelope, appearance] = await Promise.all([
    fetchSession(sessionId),
    fetchProfile(),
    resolveAppearance(),
  ]);
  if (!envelope.success || !envelope.data) notFound();

  const session = envelope.data;
  if (!sessionEditView(session).show) redirect(`/sessions/${sessionId}`);

  // The Sensitive-Constraint gate (ADR-0023): a constrained user edits with Supersets paused.
  // An absent profile defaults to allowing them; the endpoint stays the backstop.
  const hasSensitiveConstraint = profileEnvelope.data?.is_sensitive ?? false;

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        overline="PULSE // EDIT"
        title={`Edit ${sessionNameView(session).displayName}`}
      />
      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        Reorder exercises and adjust sets, reps, rest, and load. Your changes apply the
        next time you train this session. Workouts you’ve already logged stay as they were.
      </p>

      <EditSessionPlanForm
        sessionId={sessionId}
        seed={editSeedFromSession(session, appearance.weight_unit)}
        hasSensitiveConstraint={hasSensitiveConstraint}
        unit={appearance.weight_unit}
      />

      <BackLink href={`/sessions/${sessionId}`}>Back to session</BackLink>
    </section>
  );
}
