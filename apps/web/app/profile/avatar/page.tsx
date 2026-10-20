import { AvatarPicker } from "@/components/AvatarPicker";
import { Alert } from "@/components/pulse/alert";
import { BackLink } from "@/components/pulse/back-link";
import { PageHeader } from "@/components/pulse/page-header";
import { resolveAppearance } from "@/lib/appearance";
import { fetchAvatars } from "@/lib/avatars";

// The Avatar picker page (ADR-0136), reached from Profile: the whole catalog as a radio
// group with the user's current Avatar selected. The catalog read and the Interface
// Preference read run in parallel; `resolveAppearance` shares this request's cache with the
// root layout, so the current Avatar costs no extra round-trip.
export default async function AvatarPickerPage() {
  const [envelope, appearance] = await Promise.all([
    fetchAvatars(),
    resolveAppearance(),
  ]);

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // OPERATOR" title="Choose your Avatar" />
      {envelope.success && envelope.data ? (
        <AvatarPicker catalog={envelope.data} currentAvatarId={appearance.avatar} />
      ) : (
        <Alert tone="error">
          Could not load the Avatars: {envelope.error ?? "unknown error"}
        </Alert>
      )}
      <BackLink href="/profile">Back to profile</BackLink>
    </section>
  );
}
