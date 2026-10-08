import { PageHeader } from "@/components/pulse/page-header";
import { Skeleton } from "@/components/pulse/skeleton";
import { SkeletonPage } from "@/components/pulse/skeleton-reveal";

// Layout-matched loading state for Log Session. It used to inherit Session Detail's boundary,
// until Session Detail dropped its route-level skeleton so its header could commit with the
// navigation and carry the sigil morph (ADR-0120); this segment keeps a skeleton of its own.
//
// The title is the segment's own words rather than a skeletonized "Log <type> session": the
// Training Type isn't known yet, and a block inside an `<h1>` would be a `<div>` in phrasing
// content.
export default function LogSessionLoading(): React.JSX.Element {
  return (
    <SkeletonPage gap={6} header={<PageHeader overline="PULSE // LOG" title="Log session" />}>
      <Skeleton className="h-4 w-56" />

      {/* One set-entry card per prescription. */}
      <div className="flex flex-col gap-4">
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-28 w-full rounded-lg" />
      </div>

      {/* Submit */}
      <Skeleton className="h-10 w-full rounded-md" />
    </SkeletonPage>
  );
}
