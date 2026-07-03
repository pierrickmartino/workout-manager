import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Dumbbell,
  History,
  LineChart,
  Zap,
} from "lucide-react";

import {
  GENDER_OPTIONS,
  fetchProfile,
  isProfileComplete,
  type Profile,
} from "@/lib/profile";
import { READINESS_BADGE, fetchHome } from "@/lib/home";
import { Alert } from "@/components/pulse/alert";
import { PageHeader } from "@/components/pulse/page-header";
import { SectionHeader } from "@/components/pulse/section-header";
import { SessionHero } from "@/components/pulse/session-hero";
import { NavRow } from "@/components/pulse/nav-row";
import { DataList } from "@/components/pulse/data-list";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

// The dashboard renders the full Fitness Profile that round-tripped through
// Postgres on the FastAPI backend. New users (incomplete profile) are sent to
// onboarding first.
export default async function DashboardPage() {
  const [profileEnvelope, homeEnvelope] = await Promise.all([
    fetchProfile(),
    fetchHome(),
  ]);

  if (!profileEnvelope.success || !profileEnvelope.data) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader overline="PULSE // DASHBOARD" title="Dashboard" />
        <Alert tone="error">
          Could not load your profile: {profileEnvelope.error ?? "unknown error"}
        </Alert>
      </section>
    );
  }

  const profile = profileEnvelope.data;
  if (!isProfileComplete(profile)) {
    redirect("/onboarding");
  }

  if (!homeEnvelope.success || !homeEnvelope.data) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader overline="PULSE // DASHBOARD" title="Dashboard" />
        <Alert tone="error">
          Could not load your readiness: {homeEnvelope.error ?? "unknown error"}
        </Alert>
      </section>
    );
  }

  const greeting = profile.display_name ?? "operator";
  const readiness = READINESS_BADGE[homeEnvelope.data.readiness];
  const currentProtocol = homeEnvelope.data.current_protocol;

  return (
    <section className="flex flex-col gap-7">
      <PageHeader
        overline="PULSE // DASHBOARD"
        title={<>Hey, {greeting}</>}
        action={<Badge variant={readiness.variant}>{readiness.label}</Badge>}
      />

      {/* Hero: the Current Protocol's Next Session, or the generate CTA when the
          user has no Current Protocol (no Protocol, or every one is complete). */}
      {currentProtocol ? (
        <SessionHero protocol={currentProtocol} />
      ) : (
        <GenerateTrainingCta />
      )}

      {/* Records & profile navigation. */}
      <div className="flex flex-col gap-4">
        <SectionHeader>OPERATIONS</SectionHeader>
        <Card className="divide-y divide-border overflow-hidden py-0">
          <NavRow
            icon={History}
            label="Training history"
            href="/history"
            accent="cyan"
          />
          <NavRow
            icon={LineChart}
            label="Metric history"
            href="/metrics"
            accent="violet"
          />
          <NavRow
            icon={Dumbbell}
            label="Edit profile"
            href="/profile/edit"
            accent="blue"
          />
        </Card>
      </div>

      {/* Profile snapshot. */}
      <div className="flex flex-col gap-4">
        <SectionHeader meta="SNAPSHOT">FITNESS PROFILE</SectionHeader>
        <ProfileSummary profile={profile} />
      </div>
    </section>
  );
}

// The empty state shown when the user has no Current Protocol: the existing
// generate-training CTA. The Readiness badge still renders in the page header,
// so Home stays coherent even without a Protocol (ADR-0008).
function GenerateTrainingCta(): React.JSX.Element {
  return (
    <Card className="flex flex-col gap-5 p-5">
      <span className="label-mono text-[11px] text-cyan">
        GET STARTED // NO ACTIVE PROTOCOL
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-2xl font-bold text-text-primary">
          Generate training
        </h2>
        <p className="label-mono text-[11px] text-text-secondary">
          AI PROTOCOLS &middot; STANDALONE SESSIONS
        </p>
      </div>
      <div className="flex flex-col gap-2.5">
        <Link
          href="/protocols/new"
          className={buttonVariants({ className: "w-full" })}
        >
          <Zap className="h-4 w-4" />
          Generate a protocol
        </Link>
        <Link
          href="/sessions/new"
          className={buttonVariants({
            variant: "secondary",
            className: "w-full",
          })}
        >
          Generate a workout
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </Card>
  );
}

function formatGender(gender: string | null): string {
  if (gender === null) return "—";
  return GENDER_OPTIONS.find((option) => option.value === gender)?.label ?? gender;
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "—";
}

function formatLevels(levels: Record<string, number>): React.ReactNode {
  const entries = Object.entries(levels);
  if (entries.length === 0) return "—";
  return (
    <span className="flex flex-wrap justify-end gap-1.5">
      {entries.map(([type, level]) => (
        <Badge key={type} variant="outline">
          {type} {level}/10
        </Badge>
      ))}
    </span>
  );
}

function ProfileSummary({ profile }: { profile: Profile }) {
  return (
    <Card className="p-5">
      <DataList
        rows={[
          { label: "Display name", value: profile.display_name ?? "—" },
          { label: "Gender", value: formatGender(profile.gender) },
          { label: "Age", value: profile.age ?? "—" },
          {
            label: "Height",
            value:
              profile.height_cm !== null ? `${profile.height_cm} cm` : "—",
          },
          {
            label: "Weight",
            value:
              profile.weight_kg !== null ? `${profile.weight_kg} kg` : "—",
          },
          { label: "Training habits", value: profile.training_habits ?? "—" },
          {
            label: "Default equipment",
            value: formatList(profile.default_equipment),
          },
          { label: "Fitness levels", value: formatLevels(profile.fitness_levels) },
          {
            label: "Preferences / limitations",
            value: formatList(profile.preferences),
          },
          {
            label: "Sensitive constraints",
            value: formatList(profile.sensitive_constraints),
          },
          {
            label: "Requires extra caution",
            value: profile.is_sensitive ? "Yes" : "No",
          },
        ]}
      />
    </Card>
  );
}
