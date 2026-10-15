import { PageHeader } from "@/components/pulse/page-header";
import { Skeleton } from "@/components/pulse/skeleton";
import { SkeletonPage } from "@/components/pulse/skeleton-reveal";

// Layout-matched loading state for the admin AI audit log (ADR-0028, ADR-0123). It overrides the
// `/admin` boundary: same overline, but the body is a paragraph over a list of call cards.
export default function AdminAiAuditLogLoading(): React.JSX.Element {
  return (
    <SkeletonPage gap={6} header={<PageHeader overline="PULSE // ADMIN" title="AI audit log" />}>
      {/* The descriptive paragraph above the list */}
      <Skeleton className="h-10 w-full" />

      {/* Call cards */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-24 w-full rounded-sm" />
        <Skeleton className="h-24 w-full rounded-sm" />
        <Skeleton className="h-24 w-full rounded-sm" />
      </div>
    </SkeletonPage>
  );
}
