import { AdhocLogForm } from "@/components/AdhocLogForm";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { resolveAppearance } from "@/lib/appearance";

// Records a plan-less performance (ADR-0031) — a movement the user did outside any
// Protocol. No Session is fetched: the record stands alone and resolves its Exercise
// by name (search-and-create, ADR-0033) when the form is submitted.
export default async function NewAdhocLogPage() {
  const today = new Date().toISOString().slice(0, 10);
  const { weight_unit: unit } = await resolveAppearance();

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // LOG" title="Log a movement" />
      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        Record something you did outside a protocol — a run, some push-ups.
      </p>

      <AdhocLogForm today={today} unit={unit} />

      <BackLink href="/history">Back to history</BackLink>
    </section>
  );
}
