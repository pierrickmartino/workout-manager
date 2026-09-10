import { HandAuthoredSessionForm } from "@/components/HandAuthoredSessionForm";
import { fetchProfile } from "@/lib/profile";
import { resolveAppearance } from "@/lib/appearance";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";

// Build a hand-made Session plan to run later — a Hand-Authored Session with NO performance
// logged (docs/redesign-ia.md, ADR-0071). This is intent I4, split out from "Log a past
// workout" (I5, /sessions/log) so a self-managed user can author a reusable plan without the
// past-tense framing that also logs a performance. It needs no new domain model: the domain
// already allows a Hand-Authored Session with zero Logged Sessions (My Sessions lists them,
// the Delete guard is `Logged Count == 0`). It reuses the one HandAuthoredSessionForm in its
// existing `planOnly` mode (the same mode Capture uses) but with no seed — a blank draft —
// so submit creates only the plan and lands on the new Session's page, ready to Start later.
export default async function BuildSessionPage() {
  // planOnly hides the "date performed" field, but the form prop is required; today's date
  // is a harmless default it never reads in this mode.
  const today = new Date().toISOString().slice(0, 10);

  // The Sensitive-Constraint gate (ADR-0023): a user with any Sensitive Constraint builds
  // with Supersets paused and a banner. An absent profile defaults to allowing Supersets;
  // the `POST /api/sessions` endpoint remains the server-side backstop.
  const [profileEnvelope, appearance] = await Promise.all([
    fetchProfile(),
    resolveAppearance(),
  ]);
  const hasSensitiveConstraint = profileEnvelope.data?.is_sensitive ?? false;

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // BUILD" title="Build a workout" />
      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        Assemble a workout — exercises, sets, reps, rest, and load. We&apos;ll save it as a
        reusable workout you can run whenever you like. Nothing is logged yet; you record a
        performance when you train it.
      </p>

      <HandAuthoredSessionForm
        today={today}
        hasSensitiveConstraint={hasSensitiveConstraint}
        unit={appearance.weight_unit}
        mode="planOnly"
      />

      <BackLink href="/train">Back to training</BackLink>
    </section>
  );
}
