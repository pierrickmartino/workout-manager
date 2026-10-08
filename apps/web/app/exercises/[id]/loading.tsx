import { PageHeader } from "@/components/pulse/page-header";
import { Skeleton } from "@/components/pulse/skeleton";
import { SkeletonPage } from "@/components/pulse/skeleton-reveal";

// Layout-matched loading state for Exercise Detail (ADR-0028). Parallelizing the page's four
// reads collapsed them to one round trip (perf audit A1) but did not make them free, so the
// segment still has a wait to fill — and it had nothing, which is a blank screen on a browse
// surface users reach from six different origins.
//
// The header paints real text rather than a skeletonized one, as every other `loading.tsx` here
// does: the title the page will show is the Exercise's name, which this route does not know yet,
// and the segment's own name is both true and the same single line of `text-2xl`, so the swap
// re-flows the heading without moving anything below it. A block would also be a `<div>` inside
// an `<h1>`, which only accepts phrasing content.
//
// The `progress` child segment inherits this boundary, which is right: that route only redirects
// into this one's HISTORY tab.
export default function ExerciseDetailLoading(): React.JSX.Element {
  return (
    <SkeletonPage gap={7} header={<PageHeader overline="PULSE // EXERCISE" title="Exercise" />}>
      {/* Stat header — Personal Record + Total Sets */}
      <Skeleton className="h-20 w-full rounded-lg" />

      {/* SPECS / HISTORY / RECORDS tab strip */}
      <Skeleton className="h-11 w-full rounded-md" />

      {/* The active lens's panel */}
      <Skeleton className="h-64 w-full rounded-lg" />

      {/* ADD TO PROTOCOL */}
      <Skeleton className="h-10 w-full rounded-md" />
    </SkeletonPage>
  );
}
