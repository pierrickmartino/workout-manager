import { fetchProtocolsIndex } from "@/lib/protocols";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { Alert } from "@/components/pulse/alert";
import { ProtocolsIndexScreen } from "@/components/ProtocolsIndexScreen";
import { AdoptedSetAsideNote } from "@/components/AdoptedSetAsideNote";
import { ADOPTED_PARAM, curatedSetAsideNotice } from "@/lib/curated-protocol-view";

// The Protocols index (issue #637), reached from the Train launchpad and from a Protocol's
// detail page: every Protocol the user owns, grouped Current / Set aside / Finished. The server
// decides each row's status (it owns Current Protocol selection, ADR-0125); the view-model groups
// and phrases and decides each row's actions (Switch, #638) once the client shell has read the
// Live Session slot; this page only fetches and hands over.
//
// A Curated Protocol a Sensitive-Constraint user adopted lands here set aside (`?adopted=`,
// issue #687), with a note pointing at its Switch; the note goes once it is no longer set aside.
export default async function ProtocolsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ [ADOPTED_PARAM]?: string | string[] }>;
}): Promise<React.JSX.Element> {
  const [envelope, params] = await Promise.all([fetchProtocolsIndex(), searchParams]);

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

  const notice = curatedSetAsideNotice(params[ADOPTED_PARAM], envelope.data);
  return (
    <ProtocolsIndexScreen entries={envelope.data}>
      {notice !== null ? <AdoptedSetAsideNote notice={notice} /> : null}
    </ProtocolsIndexScreen>
  );
}
