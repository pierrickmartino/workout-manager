import { GenerateProtocolForm } from "@/components/GenerateProtocolForm";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { fetchHome } from "@/lib/home";
import { fetchProfile } from "@/lib/profile";
import { supersedeWarning } from "@/lib/protocol-supersede";

// Request a multi-week Protocol. Generation runs off the request path (ADR-0005):
// the form shows progress while a worker builds the plan, then navigates to the
// adopted Protocol — robust on mobile connections that may drop mid-generation.
//
// Generating a new Protocol supersedes the Current one (ADR-0037), so this reads
// Home to learn whether an in-progress Protocol would be set aside and hands the
// form a one-off confirmation to fire at generation. A failed Home read simply
// omits the guard rather than blocking generation.
export default async function NewProtocolPage() {
  const [home, profile] = await Promise.all([fetchHome(), fetchProfile()]);
  const warning = home.success
    ? supersedeWarning(home.data?.current_protocol ?? null)
    : null;
  // Pre-fill the equipment field from the saved Default Equipment (ADR-0038); a
  // failed profile read simply leaves it blank rather than blocking generation.
  const defaultEquipment = profile.success
    ? (profile.data?.default_equipment ?? [])
    : [];

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // BUILDER" title="Generate a protocol" />
      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        Choose your training type, objective, and schedule. We&apos;ll build a
        full multi-week plan with week-to-week progression.
      </p>
      <GenerateProtocolForm
        supersedeWarning={warning}
        defaultEquipment={defaultEquipment}
      />
      <BackLink href="/dashboard">Back to dashboard</BackLink>
    </section>
  );
}
