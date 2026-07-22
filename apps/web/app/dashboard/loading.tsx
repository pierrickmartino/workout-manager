import { PageHeader } from "@/components/pulse/page-header";
import { Skeleton } from "@/components/pulse/skeleton";

// Layout-matched loading state for the dashboard (ADR-0028). The PageHeader is
// static, so it paints immediately; only the data region below is skeletonized,
// with block heights matching the rendered hero/status/strip so the swap is
// CLS-free.
export default function DashboardLoading(): React.JSX.Element {
  return (
    <section className="flex flex-col gap-7">
      <PageHeader overline="PULSE // DASHBOARD" title="Dashboard" />

      {/* Session hero */}
      <Skeleton className="h-40 w-full rounded-xl" />

      {/* Operator status */}
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>

      {/* Week cycle strip */}
      <Skeleton className="h-24 w-full rounded-lg" />
    </section>
  );
}
