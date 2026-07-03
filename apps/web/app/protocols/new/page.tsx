import { GenerateProtocolForm } from "@/components/GenerateProtocolForm";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";

// Request a multi-week Protocol. Generation runs off the request path (ADR-0005):
// the form shows progress while a worker builds the plan, then navigates to the
// adopted Protocol — robust on mobile connections that may drop mid-generation.
export default function NewProtocolPage() {
  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // BUILDER" title="Generate a protocol" />
      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        Choose your training type, objective, and schedule. We&apos;ll build a
        full multi-week plan with week-to-week progression.
      </p>
      <GenerateProtocolForm />
      <BackLink href="/dashboard">Back to dashboard</BackLink>
    </section>
  );
}
