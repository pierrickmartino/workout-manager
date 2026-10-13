import { CuratedProtocolPicker } from "@/components/CuratedProtocolPicker";
import { NewProtocolChoices } from "@/components/NewProtocolChoices";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { Alert } from "@/components/pulse/alert";
import { fetchCuratedProtocols } from "@/lib/curated-protocols";
import {
  curatedProtocolRow,
  newProtocolChoices,
} from "@/lib/curated-protocol-view";

// Choose a Curated Protocol (issue #684, ADR-0130): the released, human-written plans offered
// beside "Generate for me". Picking one opens its adopt form.
export default async function CuratedProtocolsPage() {
  const result = await fetchCuratedProtocols();
  const curatedProtocols = result.success ? (result.data ?? []) : [];

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // BUILDER" title="Choose a Curated Protocol" />
      <NewProtocolChoices
        choices={newProtocolChoices("curated", { hasCuratedProtocols: curatedProtocols.length > 0 })}
      />
      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        Plans written and reviewed by a person. Adopt one and it becomes your own
        protocol to log, edit and adjust.
      </p>
      {result.success ? (
        <CuratedProtocolPicker rows={curatedProtocols.map(curatedProtocolRow)} />
      ) : (
        <Alert tone="error">{result.error ?? "Could not load Curated Protocols."}</Alert>
      )}
      <BackLink href="/protocols/new">Back to new protocol</BackLink>
    </section>
  );
}
