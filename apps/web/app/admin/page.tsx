import { notFound } from "next/navigation";

import { resolveIsAdmin } from "@/lib/admin";
import { resolveActiveSkin } from "@/lib/active-skin";
import { AppearanceSkinPublisher } from "@/components/AppearanceSkinPublisher";
import { EnrichmentBackfillControl } from "@/components/EnrichmentBackfillControl";
import { PageHeader } from "@/components/pulse/page-header";
import { SectionHeader } from "@/components/pulse/section-header";
import { BackLink } from "@/components/pulse/back-link";
import { Card } from "@/components/ui/card";

// The admin home (docs/redesign-ia.md, ADR-0071): a dedicated surface for the account's power
// features, reached by an admin-only nav row on Profile rather than a fifth tab. It gathers
// the two admin-gated capabilities that had no coherent home — publishing the Active Skin
// (relocated out of Profile → Appearance, where it was buried for every ordinary user) and
// running the catalog-enrichment backfill (previously reachable only by raw API call). The
// admin gate is resolved server-side; a non-admin gets a 404 rather than a revealed-but-denied
// page, and the backend independently gates every underlying action (ADR-0046).
export default async function AdminPage() {
  const [isAdmin, activeSkin] = await Promise.all([
    resolveIsAdmin(),
    resolveActiveSkin(),
  ]);
  if (!isAdmin) notFound();

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // ADMIN" title="Admin" />

      <div className="flex flex-col gap-4">
        <SectionHeader>ACTIVE SKIN</SectionHeader>
        <Card className="p-4">
          <AppearanceSkinPublisher activeSkin={activeSkin} />
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <SectionHeader>CATALOG ENRICHMENT</SectionHeader>
        <Card className="p-4">
          <EnrichmentBackfillControl />
        </Card>
      </div>

      <BackLink href="/profile">Back to profile</BackLink>
    </section>
  );
}
