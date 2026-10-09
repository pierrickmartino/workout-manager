import { fetchProtocolsIndex } from "@/lib/protocols";
import { protocolsIndex } from "@/lib/protocols-index";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { Alert } from "@/components/pulse/alert";
import { ProtocolsIndex } from "@/components/ProtocolsIndex";

// The Protocols index (issue #637), reached from the Train launchpad and from a Protocol's
// detail page: every Protocol the user owns, grouped Current / Set aside / Finished. The server
// decides each row's status (it owns Current Protocol selection, ADR-0125); the view-model groups
// and phrases; this page only fetches and hands over.
export default async function ProtocolsIndexPage(): Promise<React.JSX.Element> {
  const envelope = await fetchProtocolsIndex();

  if (!envelope.success || !envelope.data) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader overline="PULSE // TRAIN" title="Protocols" />
        <Alert tone="error">
          Could not load your protocols: {envelope.error ?? "unknown error"}
        </Alert>
        <BackLink href="/train">Back to train</BackLink>
      </section>
    );
  }

  return <ProtocolsIndex index={protocolsIndex(envelope.data)} />;
}
