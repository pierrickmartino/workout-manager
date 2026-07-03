import { GenerateSessionForm } from "@/components/GenerateSessionForm";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";

// Request a single, standalone Session. On success the action redirects to the
// generated session's page where its Exercise Prescriptions are displayed.
export default function NewSessionPage() {
  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // TRAIN" title="Generate a workout" />
      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        Pick a training type, a duration, and the equipment you have. We&apos;ll
        generate a standalone session tailored to it.
      </p>
      <GenerateSessionForm />
      <BackLink href="/dashboard">Back to dashboard</BackLink>
    </section>
  );
}
