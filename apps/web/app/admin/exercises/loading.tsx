import { PageHeader } from "@/components/pulse/page-header";
import { Skeleton } from "@/components/pulse/skeleton";

// Layout-matched loading state for the admin catalog browser (ADR-0028), another of "the admin
// pages" the perf audit names (A4's related backfill). This one is the longest admin wait: the
// admin gate is a legitimately sequential gate (the same argument A2 makes for the editor) and
// the read behind it fetches the *whole* bounded catalog in one go.
//
// It overrides the `/admin` boundary rather than inheriting it: same overline, but the body is a
// filter bar over a long row list, not the admin home's two cards.
export default function AdminExercisesLoading(): React.JSX.Element {
  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // ADMIN" title="Exercise catalog" />

      {/* The descriptive paragraph above the browser */}
      <Skeleton className="h-14 w-full" />

      {/* Search + the provenance / completeness / status facets */}
      <Skeleton className="h-10 w-full rounded-md" />
      <Skeleton className="h-16 w-full rounded-md" />

      {/* Catalog rows */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-12 w-full rounded-sm" />
        <Skeleton className="h-12 w-full rounded-sm" />
        <Skeleton className="h-12 w-full rounded-sm" />
        <Skeleton className="h-12 w-full rounded-sm" />
        <Skeleton className="h-12 w-full rounded-sm" />
      </div>
    </section>
  );
}
