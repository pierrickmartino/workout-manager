import { HandAuthoredSessionForm } from "@/components/HandAuthoredSessionForm";
import { fetchProfile } from "@/lib/profile";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";

// Log a past workout the user laid out themselves — a Hand-Authored Session (ADR-0040).
// No AI: the user assembles the workout from catalog exercises (sets/reps/rest/tempo/
// typed Load) and records what they performed, then one submit creates a reusable
// standalone Session and its first Logged Session together. UI copy says "workout"; the
// domain term stays Session.
export default async function LogWorkoutPage() {
  const today = new Date().toISOString().slice(0, 10);

  // The Sensitive-Constraint gate (ADR-0023, issue #290): a user with any Sensitive
  // Constraint builds with Supersets paused and a banner. The derived `is_sensitive` flag
  // comes from the Profile; an absent profile (a null-data envelope) defaults to allowing
  // Supersets — the `POST /api/sessions` endpoint remains the server-side backstop.
  const profileEnvelope = await fetchProfile();
  const hasSensitiveConstraint = profileEnvelope.data?.is_sensitive ?? false;

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // LOG" title="Log a past workout" />
      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        Build the workout you did — exercises, sets, reps, rest, and load — and record
        how it went. We&apos;ll save it as a reusable workout and log this performance.
      </p>

      <HandAuthoredSessionForm
        today={today}
        hasSensitiveConstraint={hasSensitiveConstraint}
      />

      <BackLink href="/train">Back to training</BackLink>
    </section>
  );
}
