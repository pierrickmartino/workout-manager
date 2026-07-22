import { PageHeader } from "@/components/pulse/page-header";
import { Skeleton } from "@/components/pulse/skeleton";

// Layout-matched loading state for Analytics (ADR-0028): the 2×2 overview Bento
// followed by a chart card.
export default function AnalyticsLoading(): React.JSX.Element {
  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // STATS" title="Analytics" />

      {/* Overview Bento — four stat tiles */}
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>

      {/* Chart / volume card */}
      <Skeleton className="h-56 w-full rounded-lg" />
    </section>
  );
}
