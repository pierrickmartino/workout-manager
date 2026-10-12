import { notFound } from "next/navigation";

import { CuratedAdoptForm } from "@/components/CuratedAdoptForm";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { fetchCuratedProtocols } from "@/lib/curated-protocols";
import {
  adoptFormDefaults,
  curatedProtocolRow,
  CURATED_PICKER_HREF,
} from "@/lib/curated-protocol-view";

// Adopt one Curated Protocol (issue #684): its description, then the length and starting
// weights. An unknown or unreleased program is a 404 here, as it is on the API.
export default async function AdoptCuratedProtocolPage({
  params,
}: {
  params: Promise<{ identifier: string }>;
}) {
  const { identifier } = await params;
  const result = await fetchCuratedProtocols();
  const program = result.success
    ? result.data?.find((candidate) => candidate.identifier === identifier)
    : undefined;
  if (!program) notFound();
  const row = curatedProtocolRow(program);

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // CURATED PROTOCOL" title={program.name} />
      <div className="flex flex-col gap-2">
        <span className="label-mono text-[11px] text-text-secondary">{row.schedule}</span>
        <p className="font-sans text-sm leading-relaxed text-text-secondary">
          {program.description}
        </p>
        <p className="font-mono text-[12px] text-text-muted">Equipment: {row.equipment}</p>
      </div>
      <CuratedAdoptForm identifier={program.identifier} defaults={adoptFormDefaults(program)} />
      <BackLink href={CURATED_PICKER_HREF}>Back to Curated Protocols</BackLink>
    </section>
  );
}
