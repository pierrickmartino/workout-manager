import { ProfileForm } from "@/components/ProfileForm";
import { fetchProfile } from "@/lib/profile";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { Alert } from "@/components/pulse/alert";

// Later edits to the Fitness Profile. The Profile is a mutable snapshot of
// "now", so editing simply overwrites the current values.
export default async function EditProfilePage() {
  const envelope = await fetchProfile();

  if (!envelope.success || !envelope.data) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader overline="PULSE // OPERATOR" title="Edit profile" />
        <Alert tone="error">
          Could not load your profile: {envelope.error ?? "unknown error"}
        </Alert>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // OPERATOR" title="Edit profile" />
      <ProfileForm profile={envelope.data} submitLabel="Save changes" />
      <BackLink href="/dashboard">Back to dashboard</BackLink>
    </section>
  );
}
