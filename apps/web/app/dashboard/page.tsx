import Link from "next/link";
import { redirect } from "next/navigation";

import {
  GENDER_OPTIONS,
  fetchProfile,
  isProfileComplete,
  type Profile,
} from "@/lib/profile";

// The dashboard renders the full Fitness Profile that round-tripped through
// Postgres on the FastAPI backend. New users (incomplete profile) are sent to
// onboarding first.
export default async function DashboardPage() {
  const envelope = await fetchProfile();

  if (!envelope.success || !envelope.data) {
    return (
      <section>
        <h1>Dashboard</h1>
        <p role="alert">
          Could not load your profile: {envelope.error ?? "unknown error"}
        </p>
      </section>
    );
  }

  const profile = envelope.data;
  if (!isProfileComplete(profile)) {
    redirect("/onboarding");
  }

  return (
    <section>
      <h1>Your Fitness Profile</h1>
      <ProfileSummary profile={profile} />
      <p>
        <Link href="/programs/new">Generate a program →</Link>
      </p>
      <p>
        <Link href="/sessions/new">Generate a workout →</Link>
      </p>
      <p>
        <Link href="/history">Training history →</Link>
      </p>
      <p>
        <Link href="/metrics">Metric history →</Link>
      </p>
      <p>
        <Link href="/profile/edit">Edit profile →</Link>
      </p>
    </section>
  );
}

function formatGender(gender: string | null): string {
  if (gender === null) return "(not set)";
  return GENDER_OPTIONS.find((option) => option.value === gender)?.label ?? gender;
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "(none)";
}

function formatLevels(levels: Record<string, number>): string {
  const entries = Object.entries(levels);
  if (entries.length === 0) return "(none)";
  return entries.map(([type, level]) => `${type}: ${level}/10`).join(", ");
}

function ProfileSummary({ profile }: { profile: Profile }) {
  return (
    <dl>
      <dt>Display name</dt>
      <dd>{profile.display_name ?? "(not set)"}</dd>
      <dt>Gender</dt>
      <dd>{formatGender(profile.gender)}</dd>
      <dt>Age</dt>
      <dd>{profile.age ?? "(not set)"}</dd>
      <dt>Height</dt>
      <dd>{profile.height_cm !== null ? `${profile.height_cm} cm` : "(not set)"}</dd>
      <dt>Weight</dt>
      <dd>{profile.weight_kg !== null ? `${profile.weight_kg} kg` : "(not set)"}</dd>
      <dt>Training habits</dt>
      <dd>{profile.training_habits ?? "(not set)"}</dd>
      <dt>Default equipment</dt>
      <dd>{formatList(profile.default_equipment)}</dd>
      <dt>Fitness levels</dt>
      <dd>{formatLevels(profile.fitness_levels)}</dd>
      <dt>Preferences / limitations</dt>
      <dd>{formatList(profile.preferences)}</dd>
      <dt>Sensitive constraints</dt>
      <dd>{formatList(profile.sensitive_constraints)}</dd>
      <dt>Requires extra caution (derived)</dt>
      <dd>{profile.is_sensitive ? "Yes" : "No"}</dd>
    </dl>
  );
}
