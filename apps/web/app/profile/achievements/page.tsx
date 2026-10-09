import { fetchProfileProgress } from "@/lib/profile-progress";
import { toPassport } from "@/lib/passport-view";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { TrainingPassport } from "@/components/pulse/training-passport";
import { Alert } from "@/components/pulse/alert";

// The Training Passport (ADR-0126): the "see all" destination behind the Profile summary.
// The earned Achievements read as Stamps, oldest first; beside them sits the one next
// milestone, and every other locked Achievement waits behind "More to earn" with its
// criteria. All of it is projected read-time from the user's Logged record (ADR-0018).
export default async function AchievementsPage() {
  const envelope = await fetchProfileProgress();

  if (!envelope.success || !envelope.data) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader overline="PULSE // OPERATOR" title="Training Passport" />
        <Alert tone="error">
          Could not load your passport: {envelope.error ?? "unknown error"}
        </Alert>
      </section>
    );
  }

  const { achievements } = envelope.data;
  const passport = toPassport(achievements);

  return (
    <section className="flex flex-col gap-6">
      <BackLink href="/profile">BACK TO PROFILE</BackLink>
      <PageHeader
        overline="PULSE // OPERATOR"
        title="Training Passport"
        action={
          <span className="label-mono text-[11px] text-text-secondary">
            {passport.stamps.length}/{achievements.length} STAMPS
          </span>
        }
      />
      <TrainingPassport passport={passport} />
    </section>
  );
}

