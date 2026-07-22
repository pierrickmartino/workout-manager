import { PageHeader } from "@/components/pulse/page-header";
import { Skeleton, SkeletonText } from "@/components/pulse/skeleton";

// Layout-matched loading state for Metric history (ADR-0028): the intro copy,
// a section label, and the metric table card.
export default function MetricsLoading(): React.JSX.Element {
  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // STATS" title="Metric history" />

      <SkeletonText lines={2} />

      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </section>
  );
}
