import { PageHeader } from "@/components/pulse/page-header";
import { Skeleton } from "@/components/pulse/skeleton";

// Layout-matched loading state for Strength Analytics (ADR-0028): a lift chart
// card above the Personal Records list.
export default function StrengthAnalyticsLoading(): React.JSX.Element {
  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // STATS" title="Strength Analytics" />

      {/* Estimated-1RM chart card */}
      <Skeleton className="h-56 w-full rounded-lg" />

      {/* Personal Records list */}
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-40" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </div>
    </section>
  );
}
