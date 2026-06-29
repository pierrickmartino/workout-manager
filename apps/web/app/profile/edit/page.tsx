import { ProfileForm } from "@/components/ProfileForm";
import { fetchProfile } from "@/lib/profile";

// Later edits to the Fitness Profile. The Profile is a mutable snapshot of
// "now", so editing simply overwrites the current values.
export default async function EditProfilePage() {
  const envelope = await fetchProfile();

  if (!envelope.success || !envelope.data) {
    return (
      <section>
        <h1>Edit your Fitness Profile</h1>
        <p role="alert">
          Could not load your profile: {envelope.error ?? "unknown error"}
        </p>
      </section>
    );
  }

  return (
    <section>
      <h1>Edit your Fitness Profile</h1>
      <ProfileForm profile={envelope.data} submitLabel="Save changes" />
    </section>
  );
}
