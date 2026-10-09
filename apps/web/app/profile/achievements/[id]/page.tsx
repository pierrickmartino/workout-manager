import { notFound } from "next/navigation";

import { fetchProfileProgress } from "@/lib/profile-progress";
import { stampBackLink, toStampDetail } from "@/lib/passport-view";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { StampDetailBody } from "@/components/pulse/stamp-detail";
import { Alert } from "@/components/pulse/alert";

interface StampPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}

// One Stamp's page (#652), keyed by Achievement id and reached forward from the Training
// Passport. It is served from the same profile progress read as the Passport, filtered to one
// Achievement — there is no endpoint of its own — so its source link is the crossing Logged
// Session as of this read, and never a deleted one (ADR-0018). An id the catalog does not hold
// is not found. Its back link returns to the Profile when it was opened from the Profile
// summary, and to the Passport otherwise.
export default async function StampPage({ params, searchParams }: StampPageProps) {
  const [{ id }, { from }, envelope] = await Promise.all([
    params,
    searchParams,
    fetchProfileProgress(),
  ]);
  const back = stampBackLink(from);

  if (!envelope.success || !envelope.data) {
    return (
      <section className="flex flex-col gap-6">
        <BackLink href={back.href}>{back.label}</BackLink>
        <PageHeader overline="PULSE // STAMP" title="Stamp" />
        <Alert tone="error">
          Could not load this stamp: {envelope.error ?? "unknown error"}
        </Alert>
      </section>
    );
  }

  const detail = toStampDetail(envelope.data.achievements, id);
  if (detail === null) notFound();

  return (
    <section className="flex flex-col gap-6">
      <BackLink href={back.href}>{back.label}</BackLink>
      <PageHeader overline="PULSE // STAMP" title={detail.name} />
      <StampDetailBody detail={detail} />
    </section>
  );
}
