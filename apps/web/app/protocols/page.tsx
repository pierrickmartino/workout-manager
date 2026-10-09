import { fetchProtocolsIndex } from "@/lib/protocols";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { Alert } from "@/components/pulse/alert";
import { ProtocolsIndexScreen } from "@/components/ProtocolsIndexScreen";

// The Protocols index (issue #637), reached from the Train launchpad and from a Protocol's
// detail page: every Protocol the user owns, grouped Current / Set aside / Finished. The server
// decides each row's status (it owns Current Protocol selection, ADR-0125); the view-model groups
// and phrases and decides each row's actions (Switch, #638) once the client shell has read the
// Live Session slot; this page only fetches and hands over.
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

  return <ProtocolsIndexScreen entries={envelope.data} />;
}
