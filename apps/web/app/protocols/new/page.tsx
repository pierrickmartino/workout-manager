import { GenerateProtocolForm } from "@/components/GenerateProtocolForm";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { fetchHome } from "@/lib/home";
import { fetchProfile } from "@/lib/profile";

// Request a multi-week Protocol. Generation runs off the request path (ADR-0005):
// the form shows progress while a worker builds the plan, then navigates to the
// adopted Protocol — robust on mobile connections that may drop mid-generation.
//
// Generating a new Protocol supersedes the Current one and sets it aside. That is no
// longer a one-way door (ADR-0125: it can be Switched back to), so nothing is asked; this
// reads Home only to hand the form the Current Protocol's id, so the adopted Protocol can
// note where the old one went. A failed Home read simply omits the note.
export default async function NewProtocolPage() {
  const [home, profile] = await Promise.all([fetchHome(), fetchProfile()]);
  const setAsideProtocolId = home.success
    ? (home.data?.current_protocol?.id ?? null)
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
        setAsideProtocolId={setAsideProtocolId}
        defaultEquipment={defaultEquipment}
      />
      <BackLink href="/dashboard">Back to dashboard</BackLink>
    </section>
  );
}
