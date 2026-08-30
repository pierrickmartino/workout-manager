import Link from "next/link";
import { User } from "lucide-react";

import { fetchProfileProgress } from "@/lib/profile-progress";
import { fetchTrainingHeatmap } from "@/lib/heatmap";
import { toHeatmapGrid } from "@/lib/heatmap-view";
import { resolveAppearance } from "@/lib/appearance";
import { resolveActiveSkin } from "@/lib/active-skin";
import { resolveIsAdmin } from "@/lib/admin";
import { toAchievementCards } from "@/lib/achievements-view";
import { buildAppearanceView } from "@/lib/appearance-view";
import { AppearanceModePicker } from "@/components/AppearanceModePicker";
import { AppearanceKeepAwakeToggle } from "@/components/AppearanceKeepAwakeToggle";
import { AppearanceWeightUnitToggle } from "@/components/AppearanceWeightUnitToggle";
import { AppearanceSkinPublisher } from "@/components/AppearanceSkinPublisher";
import { PageHeader } from "@/components/pulse/page-header";
import { SectionHeader } from "@/components/pulse/section-header";
import { NavRow } from "@/components/pulse/nav-row";
import { SignOutRow } from "@/components/pulse/sign-out-row";
import { LevelBadge } from "@/components/pulse/level-badge";
import { AchievementWall } from "@/components/pulse/achievement-wall";
import { TrainingHeatmap } from "@/components/pulse/training-heatmap";
import { Bento, BentoTile } from "@/components/pulse/bento";
import { Alert } from "@/components/pulse/alert";
import { Card } from "@/components/ui/card";

// How many badges the compact Profile summary shows before the "see all" affordance
// reaches the full catalog — keeping the summary short (ADR-0019).
const SUMMARY_COUNT = 4;

// The Profile view screen (F5 Slices 1–2): the net-new landing page for the Profile tab,
// which until now had only the edit form. It reflects the user's real training back to
// them, honestly — the Operator Level with an XP progress bar, the weekly Streak, and the
// lifetime Total Sessions / Total Sets, all derived read-time from Logged Sessions
// (ADR-0018) — plus the two account affordances that belong here: a link to the Fitness
// Profile edit form and an explicit log-out. A brand-new user with no history sees
// sensible zero states (Level 1, 0 XP, no streak), not an error. Later F5 slices layer
// Achievements onto this same spine — a compact wall with a "see all" affordance to the
// full catalog.
export default async function ProfilePage() {
  // Resolve everything the page needs in parallel. `resolveActiveSkin` /
  // `resolveIsAdmin` share this request's cache with the root layout, so the extra
  // reads are effectively free; the Skin controls are rendered only for an admin.
  const [envelope, heatmapEnvelope, appearancePref, activeSkin, isAdmin] =
    await Promise.all([
      fetchProfileProgress(),
      fetchTrainingHeatmap(),
      resolveAppearance(),
      resolveActiveSkin(),
      resolveIsAdmin(),
    ]);
  const {
    mode,
    keep_screen_awake: keepScreenAwake,
    weight_unit: weightUnit,
  } = appearancePref;

  if (!envelope.success || !envelope.data) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader overline="PULSE // OPERATOR" title="Profile" />
        <Alert tone="error">
          Could not load your profile: {envelope.error ?? "unknown error"}
        </Alert>
      </section>
    );
  }

  const { xp, level, streak, total_sessions, total_sets, achievements } =
    envelope.data;
  const cards = toAchievementCards(achievements);
  // The Heatmap is a secondary read on its own endpoint (ADR-0054); a failure there must
  // not blank the whole Profile, so it simply omits the mosaic when it can't load.
  const heatmapGrid =
    heatmapEnvelope.success && heatmapEnvelope.data
      ? toHeatmapGrid(heatmapEnvelope.data)
      : null;
  const unlockedCount = cards.filter((card) => card.unlocked).length;

  // The per-role Appearance decision runs through the one tested view-model: an
  // admin gets a `skinControl` (so the Skin catalog is rendered), a non-admin does
  // not. The interactive Mode/Skin slices are rebuilt client-side by the pickers as
  // their local selection changes; this call is the role gate.
  const appearance = buildAppearanceView({ mode, isAdmin, activeSkin });

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // OPERATOR" title="Profile" />

      <LevelBadge xp={xp} level={level} />

      <div className="flex flex-col gap-4">
        <SectionHeader>LIFETIME</SectionHeader>
        <Bento>
          <BentoTile
            label="STREAK"
            value={streak}
            caption={streak === 1 ? "WEEK" : "WEEKS"}
          />
          <BentoTile label="TOTAL SESSIONS" value={total_sessions} />
          <BentoTile label="TOTAL SETS" value={total_sets} span="full" />
        </Bento>
      </div>

      {heatmapGrid ? (
        <div className="flex flex-col gap-4">
          <SectionHeader>TRAINING HEATMAP</SectionHeader>
          <TrainingHeatmap grid={heatmapGrid} />
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        <SectionHeader
          meta={
            cards.length > SUMMARY_COUNT ? (
              <Link
                href="/profile/achievements"
                className="transition-colors hover:text-cyan"
              >
                SEE ALL →
              </Link>
            ) : undefined
          }
        >
          ACHIEVEMENTS · {unlockedCount}/{cards.length}
        </SectionHeader>
        <AchievementWall cards={cards.slice(0, SUMMARY_COUNT)} />
      </div>

      <div className="flex flex-col gap-4">
        <SectionHeader>APPEARANCE</SectionHeader>
        {/* The Interface Preferences (ADR-0055) live together: the Mode picker and,
            beneath dividers, the Keep Screen Awake and Weight Unit toggles. */}
        <Card className="p-4">
          <div className="flex flex-col gap-4">
            <AppearanceModePicker currentMode={mode} />
            <div className="border-t border-border pt-4">
              <AppearanceKeepAwakeToggle keepScreenAwake={keepScreenAwake} />
            </div>
            <div className="border-t border-border pt-4">
              <AppearanceWeightUnitToggle weightUnit={weightUnit} />
            </div>
          </div>
        </Card>
        {/* The Skin catalog is an admin-only control (ADR-0048): an ordinary user
            picks their Mode and nothing more. `skinControl` is present only for an
            admin (decided server-side from the Clerk role claim); the backend
            independently gates the publish regardless of what is rendered here. */}
        {appearance.skinControl ? (
          <Card className="p-4">
            <AppearanceSkinPublisher
              activeSkin={appearance.skinControl.activeSkin}
            />
          </Card>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        <SectionHeader>ACCOUNT</SectionHeader>
        <Card className="divide-y divide-border overflow-hidden py-0">
          <NavRow
            icon={User}
            label="Edit fitness profile"
            href="/profile/edit"
            accent="cyan"
          />
          <SignOutRow />
        </Card>
      </div>
    </section>
  );
}
