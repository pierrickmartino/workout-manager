import { PageHeader } from "@/components/pulse/page-header";
import { Skeleton } from "@/components/pulse/skeleton";

// Layout-matched loading state for the Live Session screen (ADR-0028). This is the wait the
// perf audit cared most about (A3): the user has just tapped Start and is standing in a gym on
// mobile data, so this is the gap between the tap and the first set. Settling the route's three
// reads together shortened it; this stops it being blank.
//
// It overrides the `/sessions/[id]` boundary rather than inheriting it, because the Live Session
// screen's shape is its own: a `gap-6` column whose second row is the sticky timer bar pinned
// beneath the app header. A skeleton that omitted that bar would shift every set row down by its
// height on the swap, which is the CLS trade ADR-0028 warns a mismatched placeholder makes.
export default function LiveSessionLoading(): React.JSX.Element {
  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // LIVE" title="Live session" />

      {/* The always-on bar. Only what fixes the set list's starting offset is reproduced — the
          full-bleed inset, the border and the vertical padding. The real bar's `sticky top-14
          z-20 bg-base/95 backdrop-blur` is deliberately *not* copied: those govern how it
          overlays a scrolling list, and nothing is scrolling yet. Copying the whole class string
          would be one more place for it to drift out of step with
          `LiveSessionScreen`, for no layout gain. */}
      <div className="-mx-6 flex flex-col gap-2.5 border-b border-border px-6 py-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>

      {/* The set list — the current unit expanded, the next two collapsed */}
      <Skeleton className="h-56 w-full rounded-lg" />
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-16 w-full rounded-lg" />
    </section>
  );
}
