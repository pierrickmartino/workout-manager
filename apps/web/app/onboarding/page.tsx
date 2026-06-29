import { redirect } from "next/navigation";

import { ProfileForm } from "@/components/ProfileForm";
import { fetchProfile, isProfileComplete } from "@/lib/profile";

// First-run onboarding. If the profile is already complete we send the user on
// to their dashboard rather than re-collecting everything.
export default async function OnboardingPage() {
  const envelope = await fetchProfile();
  if (envelope.success && envelope.data && isProfileComplete(envelope.data)) {
    redirect("/dashboard");
  }

  return (
    <section>
      <h1>Set up your Fitness Profile</h1>
      <p>
        Tell us about yourself so we can personalize your training. You can
        change any of this later.
      </p>
      <ProfileForm
        profile={envelope.data ?? undefined}
        submitLabel="Complete onboarding"
      />
    </section>
  );
}
