import { PageHeader } from "@/components/pulse/page-header";
import { Skeleton } from "@/components/pulse/skeleton";

// Layout-matched loading state for Session Detail (ADR-0028), one of the data-heavy routes the
// perf audit found without one (A4's related backfill). The page reads the Session and then one
// harder-variation probe per prescription, so a twelve-exercise Session is a round trip plus a
// twelve-way fan-out — the longest wait of any read-only screen in the app, and until now a
// blank one.
//
// The title is the segment's own name, not a skeletonized stand-in for the Session's training
// type: it is true, it is the same single line of `text-2xl`, and a block would be a `<div>`
// inside an `<h1>`, which only accepts phrasing content.
//
// The `log` child segment inherits this boundary: same `<section>` + header + stacked-cards
// shape, so the skeleton still does its layout job there. `live` overrides it with its own,
// because its sticky timer bar is a shape this does not describe.
export default function SessionDetailLoading(): React.JSX.Element {
  return (
    <section className="flex flex-col gap-7">
      <PageHeader overline="PULSE // SESSION" title="Session" />

      {/* Session summary card */}
      <Skeleton className="h-28 w-full rounded-lg" />

      {/* EXERCISES — one card per prescription */}
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-28 w-full rounded-lg" />
      </div>

      {/* Start / log actions */}
      <Skeleton className="h-10 w-full rounded-md" />
    </section>
  );
}
