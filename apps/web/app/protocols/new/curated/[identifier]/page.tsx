import { notFound } from "next/navigation";

import { CuratedAdoptForm } from "@/components/CuratedAdoptForm";
import { Alert } from "@/components/pulse/alert";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { fetchCuratedProtocols, previewCuratedProtocol } from "@/lib/curated-protocols";
import {
  curatedPlanView,
  defaultFormSnapshot,
  defaultPreviewRequest,
  type CuratedPreview,
} from "@/lib/curated-plan-preview";
import {
  adoptFormDefaults,
  curatedCaveat,
  curatedLoggedSetNotice,
  curatedProtocolRow,
  CURATED_PICKER_HREF,
  findCuratedProtocol,
  type AdoptFormDefaults,
} from "@/lib/curated-protocol-view";

// Adopt one Curated Protocol (issue #684): its description, then the length and starting
// weights, with the plan the prefilled inputs would write already previewed (issues #685, #686),
// under the caveat for a user with a Sensitive Constraint (issue #687). A wave Curated Protocol
// whose main lift the user hasn't logged shows what to log instead of the form (issue #694).
// An unknown or unreleased Curated Protocol is a 404 here, as it is on the API.

// The plan the prefilled inputs would write; `null` when the read fails, which leaves the form
// to preview on demand.
async function initialPreviewFor(
  identifier: string,
  defaults: AdoptFormDefaults,
): Promise<CuratedPreview | null> {
  const previewed = await previewCuratedProtocol(
    identifier,
    defaultPreviewRequest(defaults),
  ).catch(() => null);
  return previewed?.success && previewed.data
    ? { snapshot: defaultFormSnapshot(defaults), plan: curatedPlanView(previewed.data) }
    : null;
}

export default async function AdoptCuratedProtocolPage({
  params,
}: {
  params: Promise<{ identifier: string }>;
}) {
  const { identifier } = await params;
  const result = await fetchCuratedProtocols();
  const curated = findCuratedProtocol(result, identifier);
  if (!curated) notFound();
  const row = curatedProtocolRow(curated);
  const loggedSetNotice = curatedLoggedSetNotice(curated);
  const defaults = adoptFormDefaults(curated);
  const initialPreview =
    loggedSetNotice === null ? await initialPreviewFor(curated.identifier, defaults) : null;

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // CURATED PROTOCOL" title={curated.name} />
      <div className="flex flex-col gap-2">
        <span className="label-mono text-[11px] text-text-secondary">{row.schedule}</span>
        <p className="font-sans text-sm leading-relaxed text-text-secondary">
          {curated.description}
        </p>
        <p className="font-mono text-[12px] text-text-muted">Equipment: {row.equipment}</p>
        {row.equipmentFlag !== null ? (
          <p className="font-mono text-[12px] text-amber">{row.equipmentFlag}</p>
        ) : null}
      </div>
      {loggedSetNotice !== null ? (
        <Alert tone="info">
          <span className="flex flex-col gap-1">
            <strong className="font-semibold text-text-primary">{loggedSetNotice.title}</strong>
            <span>{loggedSetNotice.body}</span>
          </span>
        </Alert>
      ) : (
        <CuratedAdoptForm
          identifier={curated.identifier}
          defaults={defaults}
          initialPreview={initialPreview}
          caveat={curatedCaveat(curated)}
        />
      )}
      <BackLink href={CURATED_PICKER_HREF}>Back to Curated Protocols</BackLink>
    </section>
  );
}
