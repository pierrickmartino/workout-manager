import { User } from "lucide-react";

import { fetchProfileProgress } from "@/lib/profile-progress";
import { PageHeader } from "@/components/pulse/page-header";
import { SectionHeader } from "@/components/pulse/section-header";
import { NavRow } from "@/components/pulse/nav-row";
import { SignOutRow } from "@/components/pulse/sign-out-row";
import { Bento, BentoTile } from "@/components/pulse/bento";
import { Alert } from "@/components/pulse/alert";
import { Card } from "@/components/ui/card";

// The Profile view screen (F5 Slice 1): the net-new landing page for the Profile tab,
// which until now had only the edit form. It reflects the user's real training back to
// them, honestly — the weekly Streak and lifetime Total Sessions / Total Sets, all
// derived read-time from Logged Sessions (ADR-0018) — plus the two account affordances
// that belong here: a link to the Fitness Profile edit form and an explicit log-out. A
// brand-new user with no history sees sensible zero states, not an error. Later F5
// slices layer Operator Level / XP and Achievements onto this same spine.
export default async function ProfilePage() {
  const envelope = await fetchProfileProgress();

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

  const { streak, total_sessions, total_sets } = envelope.data;

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // OPERATOR" title="Profile" />

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
