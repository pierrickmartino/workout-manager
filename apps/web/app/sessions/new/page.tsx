import { GenerateSessionForm } from "@/components/GenerateSessionForm";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { fetchProfile } from "@/lib/profile";

// Request a single, standalone Session. On success the action redirects to the
// generated session's page where its Exercise Prescriptions are displayed.
export default async function NewSessionPage() {
  // Pre-fill the equipment field from the saved Default Equipment (ADR-0038); a
  // failed profile read simply leaves it blank rather than blocking generation.
  const profile = await fetchProfile();
  const defaultEquipment = profile.success
    ? (profile.data?.default_equipment ?? [])
    : [];

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // TRAIN" title="Generate a workout" />
      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        Pick a training type, a duration, and the equipment you have. We&apos;ll
        generate a standalone session tailored to it.
      </p>
      <GenerateSessionForm defaultEquipment={defaultEquipment} />
      <BackLink href="/dashboard">Back to dashboard</BackLink>
    </section>
  );
}
