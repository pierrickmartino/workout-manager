import { PageHeader } from "@/components/pulse/page-header";
import { Skeleton, SkeletonText } from "@/components/pulse/skeleton";
import { SkeletonPage } from "@/components/pulse/skeleton-reveal";

// Layout-matched loading state for Metric history (ADR-0028): the intro copy,
// a section label, and the metric table card.
export default function MetricsLoading(): React.JSX.Element {
  return (
    <SkeletonPage gap={6} header={<PageHeader overline="PULSE // STATS" title="Metric history" />}>
      <SkeletonText lines={2} />

      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </SkeletonPage>
  );
}
