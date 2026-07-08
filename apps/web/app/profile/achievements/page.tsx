import { fetchProfileProgress } from "@/lib/profile-progress";
import { toAchievementCards } from "@/lib/achievements-view";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { AchievementWall } from "@/components/pulse/achievement-wall";
import { Alert } from "@/components/pulse/alert";

// The full Achievement catalog (F5 Slice 3): the "see all" destination behind the compact
// wall on the Profile summary. It renders every curated, type-neutral badge — unlocked ones
// with the date earned, locked ones with their criteria and live progress — all projected
// read-time from the user's Logged record (ADR-0018). A brand-new user sees the whole
// catalog locked at 0 progress, never an error.
export default async function AchievementsPage() {
  const envelope = await fetchProfileProgress();

  if (!envelope.success || !envelope.data) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader overline="PULSE // OPERATOR" title="Achievements" />
        <Alert tone="error">
          Could not load your achievements: {envelope.error ?? "unknown error"}
        </Alert>
      </section>
    );
  }

  const cards = toAchievementCards(envelope.data.achievements);
  const unlockedCount = cards.filter((card) => card.unlocked).length;

  return (
    <section className="flex flex-col gap-6">
      <BackLink href="/profile">BACK TO PROFILE</BackLink>
      <PageHeader
        overline="PULSE // OPERATOR"
        title="Achievements"
        action={
          <span className="label-mono text-[11px] text-text-secondary">
            {unlockedCount}/{cards.length} UNLOCKED
          </span>
        }
      />
      <AchievementWall cards={cards} />
    </section>
  );
}
