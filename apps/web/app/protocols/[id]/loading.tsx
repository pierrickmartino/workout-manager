import { PageHeader } from "@/components/pulse/page-header";
import { Skeleton } from "@/components/pulse/skeleton";
import { SkeletonPage } from "@/components/pulse/skeleton-reveal";

// Layout-matched loading state for Protocol Detail (ADR-0028), another of the data-heavy routes
// the perf audit found without one (A4's related backfill).
//
// The title is the segment's own name, not a skeletonized stand-in for the Protocol's: it is
// true, it is the same single line of `text-2xl`, and a block would be a `<div>` inside an
// `<h1>`, which only accepts phrasing content.
//
// The `edit` child segment overrides this with its own, because the builder's overline says
// BUILDER and its first block is the config card rather than a summary.
export default function ProtocolDetailLoading(): React.JSX.Element {
  return (
    <SkeletonPage gap={7} header={<PageHeader overline="PULSE // PROTOCOL" title="Protocol" />}>
      {/* Protocol summary card */}
      <Skeleton className="h-36 w-full rounded-lg" />

      {/* SCHEDULE — one row per Session, grouped by week */}
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    </SkeletonPage>
  );
}
