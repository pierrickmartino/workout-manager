import Link from "next/link";
import { ShieldCheck, User } from "@/components/pulse/icons";

import { fetchProfile } from "@/lib/profile";
import { fetchProfileProgress } from "@/lib/profile-progress";
import { fetchTrainingHeatmap } from "@/lib/heatmap";
import { toHeatmapGrid } from "@/lib/heatmap-view";
import { resolveAppearance } from "@/lib/appearance";
import { resolveIsAdmin } from "@/lib/admin";
import { toPassport } from "@/lib/passport-view";
import { toFitnessLevelRows } from "@/lib/fitness-level-standing";
import { AppearanceModePicker } from "@/components/AppearanceModePicker";
import { AppearanceKeepAwakeToggle } from "@/components/AppearanceKeepAwakeToggle";
import { AppearanceWeightUnitToggle } from "@/components/AppearanceWeightUnitToggle";
import { PageHeader } from "@/components/pulse/page-header";
import { SectionHeader } from "@/components/pulse/section-header";
import { NavRow } from "@/components/pulse/nav-row";
import { SignOutRow } from "@/components/pulse/sign-out-row";
import { LevelBadge } from "@/components/pulse/level-badge";
import { PassportHighlights } from "@/components/pulse/training-passport";
import { TrainingHeatmap } from "@/components/pulse/training-heatmap";
import { FitnessProfileSummary } from "@/components/pulse/fitness-profile-summary";
import { FitnessLevelStandings } from "@/components/pulse/fitness-level-standings";
import { Bento, BentoTile } from "@/components/pulse/bento";
import { Alert } from "@/components/pulse/alert";
import { Card } from "@/components/ui/card";
import { NAV_FORWARD } from "@/lib/nav-direction";

// The Profile view screen (F5 Slices 1–2): the net-new landing page for the Profile tab,
// which until now had only the edit form. It reflects the user's real training back to
// them, honestly — the Operator Level with an XP progress bar, the weekly Streak, and the
// lifetime Total Sessions / Total Sets, all derived read-time from Logged Sessions
// (ADR-0018) — plus the two account affordances that belong here: a link to the Fitness
// Profile edit form and an explicit log-out. A brand-new user with no history sees
// sensible zero states (Level 1, 0 XP, no streak), not an error. The Training Passport
// summary (ADR-0126) shows the earned Stamps and the next milestone, and links to the full
// Passport, where the rest of the locked Achievements wait behind "More to earn".
export default async function ProfilePage() {
  // Resolve everything the page needs in parallel. `resolveActiveSkin` /
  // `resolveIsAdmin` share this request's cache with the root layout, so the extra
  // reads are effectively free; the admin nav row to /admin is rendered only for an admin.
  const [envelope, profileEnvelope, heatmapEnvelope, appearancePref, isAdmin] =
    await Promise.all([
      fetchProfileProgress(),
      fetchProfile(),
      fetchTrainingHeatmap(),
      resolveAppearance(),
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

  const {
    xp,
    level,
    streak,
    total_sessions,
    total_sets,
    achievements,
    fitness_levels,
  } = envelope.data;
  const passport = toPassport(achievements);
  // The Fitness Level standing (ADR-0112): one row per *declared* Training Type. It comes from
  // the progress read model, beside Operator Level, and never from the Profile endpoint —
  // whose `fitness_levels` field the edit form writes back, so a derived level placed there
  // would round-trip into the declared baseline on the first save (ADR-0018).
  const fitnessLevelRows = toFitnessLevelRows(fitness_levels);
  // The Heatmap is a secondary read on its own endpoint (ADR-0054); a failure there must
  // not blank the whole Profile, so it simply omits the mosaic when it can't load.
  const heatmapGrid =
    heatmapEnvelope.success && heatmapEnvelope.data
      ? toHeatmapGrid(heatmapEnvelope.data)
      : null;

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // OPERATOR" title="Profile" />

      <LevelBadge xp={xp} level={level} />

      {/* Declared against Effective, per Training Type. Omitted only when the user has
          declared no level at all — there is then nothing to read a projection against, and
          "Edit fitness profile" below is where a level is declared in the first place. */}
      {fitnessLevelRows.length > 0 ? (
        <FitnessLevelStandings rows={fitnessLevelRows} />
      ) : null}

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
            <Link
              {...NAV_FORWARD}
              href="/profile/achievements"
              className="transition-colors hover:text-cyan"
            >
              OPEN PASSPORT →
            </Link>
          }
        >
          TRAINING PASSPORT · {passport.stamps.length}/{achievements.length}
        </SectionHeader>
        <PassportHighlights passport={passport} headingLevel={3} />
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
        {/* The admin-only Skin catalog moved to the dedicated /admin home (ADR-0071):
            an ordinary user picks their Mode and nothing more, and an admin reaches
            Skin publishing via the admin row in ACCOUNT below. */}
      </div>

      {/* The generation-input Fitness Profile snapshot, demoted here from Home
          (docs/redesign-ia.md, ADR-0071). Read-only; the editable form is the
          "Edit fitness profile" row below. Omitted if the profile read failed —
          the progress read above already succeeded to reach here. */}
      {profileEnvelope.success && profileEnvelope.data ? (
        <div className="flex flex-col gap-4">
          <SectionHeader>FITNESS PROFILE</SectionHeader>
          <FitnessProfileSummary profile={profileEnvelope.data} />
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        <SectionHeader>ACCOUNT</SectionHeader>
        <Card className="divide-y divide-border overflow-hidden py-0">
          <NavRow
            icon={User}
            label="Edit fitness profile"
            href="/profile/edit"
            direction={NAV_FORWARD}
            accent="cyan"
          />
          {/* Admin-only: the dedicated /admin home for power features — publishing the
              Active Skin and running catalog enrichment (ADR-0071). Rendered only for an
              admin (server-resolved role claim); the backend gates the actions regardless. */}
          {isAdmin ? (
            <NavRow
              icon={ShieldCheck}
              label="Admin"
              href="/admin"
              direction={NAV_FORWARD}
              accent="violet"
            />
          ) : null}
          <SignOutRow />
        </Card>
      </div>
    </section>
  );
}
