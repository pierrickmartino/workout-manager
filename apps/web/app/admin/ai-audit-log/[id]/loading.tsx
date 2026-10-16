import { PageHeader } from "@/components/pulse/page-header";
import { Skeleton } from "@/components/pulse/skeleton";
import { SkeletonPage } from "@/components/pulse/skeleton-reveal";

// Layout-matched loading state for one AI audit log call (ADR-0028, ADR-0123): the metadata
// block, then the stacked text blocks.
export default function AdminAiAuditCallLoading(): React.JSX.Element {
  return (
    <SkeletonPage gap={6} header={<PageHeader overline="PULSE // ADMIN" title="AI call" />}>
      {/* Kind, instant and facts */}
      <Skeleton className="h-20 w-full" />

      {/* System prompt, user prompt, output */}
      <Skeleton className="h-48 w-full rounded-sm" />
      <Skeleton className="h-32 w-full rounded-sm" />
      <Skeleton className="h-48 w-full rounded-sm" />
    </SkeletonPage>
  );
}
