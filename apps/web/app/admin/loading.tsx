import { PageHeader } from "@/components/pulse/page-header";
import { Skeleton } from "@/components/pulse/skeleton";
import { SkeletonPage } from "@/components/pulse/skeleton-reveal";

// Layout-matched loading state for the admin home (ADR-0028). One of "the admin pages" the perf
// audit lists as a data-heavy route with no `loading.tsx` (A4's related backfill): the page
// settles the admin gate and the Active Skin together and rendered nothing until both returned.
//
// Both the overline and the title are static, so the real header paints. The `exercises` child
// segment overrides this with its own, and `exercises/[id]` with its own again, because neither
// is a two-card stack.
export default function AdminLoading(): React.JSX.Element {
  return (
    <SkeletonPage gap={6} header={<PageHeader overline="PULSE // ADMIN" title="Admin" />}>
      {/* ACTIVE SKIN — the publisher card */}
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-28 w-full rounded-lg" />
      </div>

      {/* CATALOG — the nav rows into the admin exercise area */}
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    </SkeletonPage>
  );
}
