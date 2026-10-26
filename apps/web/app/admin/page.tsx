import { notFound } from "next/navigation";

import { Activity, Dumbbell } from "@/components/pulse/icons";

import { resolveIsAdmin } from "@/lib/admin";
import { resolveActiveSkin } from "@/lib/active-skin";
import { resolveAvatarUniverse } from "@/lib/avatar-universe";
import { fetchAdminDashboard } from "@/lib/admin-dashboard";
import { ADMIN_AUDIT_LOG_PATH, ADMIN_CATALOG_PATH } from "@/lib/admin-paths";
import { GENERATION_CALL_WINDOW_DAYS } from "@/lib/admin-generation-calls-view";
import { AppearanceSkinPublisher } from "@/components/AppearanceSkinPublisher";
import { AvatarUniversePublisher } from "@/components/AvatarUniversePublisher";
import { AdminDashboardColumns } from "@/components/pulse/admin-dashboard-columns";
import { DashboardTileGroups } from "@/components/pulse/dashboard-tiles";
import { GeneratorKindBreakdown } from "@/components/pulse/generator-kind-breakdown";
import { PageHeader } from "@/components/pulse/page-header";
import { SectionHeader } from "@/components/pulse/section-header";
import { NavRow } from "@/components/pulse/nav-row";
import { BackLink } from "@/components/pulse/back-link";
import { Card } from "@/components/ui/card";
import { NAV_FORWARD } from "@/lib/nav-direction";

// The admin home (docs/redesign-ia.md, ADR-0071): a dedicated surface for the account's power
// features, reached by an admin-only nav row on Profile rather than a fifth tab. It publishes
// the Active Skin (relocated out of Profile → Appearance, where it was buried for every
// ordinary user) and the Avatar Universe every user's Avatar is drawn in (ADR-0137), and links
// into the admin exercise area. The catalog-enrichment tools — the
// completeness readout and the whole-catalog backfill — now live inside that exercise area
// (issue #508) beside the per-Exercise enrich-now, so all enrichment controls sit in one place.
// It also links to the AI audit log (issue #730, ADR-0135), the recent Generation Calls.
// The admin gate is resolved server-side; a non-admin gets a 404 rather than a
// revealed-but-denied page, and the backend independently gates every underlying action
// (ADR-0046).
//
// At `lg:` it is a dashboard (ADR-0142): it opts into the wide shell (ADR-0088), and a row of
// read-time summary tiles — each a link into the list behind its number — sits over the
// Publishing and Operations columns: catalog health and AI usage over the Generation Call
// log's 3-day window, with the calls-by-Generator-Kind list under the AI nav row (#769). The
// tiles are read only after the admin gate, and each group fails on its own, so a metric that
// cannot load never blocks a publisher.
export default async function AdminPage() {
  const [isAdmin, activeSkin, avatarUniverse] = await Promise.all([
    resolveIsAdmin(),
    resolveActiveSkin(),
    resolveAvatarUniverse(),
  ]);
  if (!isAdmin) notFound();

  const dashboard = await fetchAdminDashboard();

  return (
    <section className="flex flex-col gap-6" data-shell="wide">
      <PageHeader overline="PULSE // ADMIN" title="Admin" />

      <AdminDashboardColumns
        tiles={<DashboardTileGroups groups={dashboard.groups} />}
        publishing={
          <>
            <div className="flex flex-col gap-4">
              <SectionHeader>ACTIVE SKIN</SectionHeader>
              <Card className="p-4">
                <AppearanceSkinPublisher activeSkin={activeSkin} />
              </Card>
            </div>

            <div className="flex flex-col gap-4">
              <SectionHeader>AVATAR UNIVERSE</SectionHeader>
              <Card className="p-4">
                <AvatarUniversePublisher activeUniverse={avatarUniverse} />
              </Card>
            </div>
          </>
        }
        operations={
          <>
            <div className="flex flex-col gap-4">
              <SectionHeader>CATALOG</SectionHeader>
              <Card className="p-0">
                <NavRow
                  icon={Dumbbell}
                  label="Exercise catalog"
                  href={ADMIN_CATALOG_PATH}
                  direction={NAV_FORWARD}
                  value="BROWSE"
                  accent="cyan"
                />
              </Card>
            </div>

            <div className="flex flex-col gap-4">
              <SectionHeader>AI</SectionHeader>
              <Card className="p-0">
                <NavRow
                  icon={Activity}
                  label="AI audit log"
                  href={ADMIN_AUDIT_LOG_PATH}
                  direction={NAV_FORWARD}
                  value={`${GENERATION_CALL_WINDOW_DAYS} DAYS`}
                  accent="cyan"
                />
              </Card>
            </div>

            <GeneratorKindBreakdown kinds={dashboard.generatorKinds} />
          </>
        }
      />

      <BackLink href="/profile">Back to profile</BackLink>
    </section>
  );
}
