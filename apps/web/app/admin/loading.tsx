import { PageHeader } from "@/components/pulse/page-header";
import { Skeleton } from "@/components/pulse/skeleton";
import { SkeletonPage } from "@/components/pulse/skeleton-reveal";
import { AdminDashboardColumns } from "@/components/pulse/admin-dashboard-columns";

// Layout-matched loading state for the admin home (ADR-0028, ADR-0123). One of "the admin pages"
// the perf audit lists as a data-heavy route with no `loading.tsx` (A4's related backfill): the
// page settles the admin gate, the Active Skin and the dashboard reads before it renders.
//
// Both the overline and the title are static, so the real header paints. The data region uses
// the page's own `AdminDashboardColumns` and opts into the wide shell like the page does
// (ADR-0142), so at `lg:` the tile row and the two columns hold their place, and below `lg:` it is
// the same stack of cards as before. The `exercises` child segment overrides this with its own,
// and `exercises/[id]` with its own again, because neither is a stack of cards.
export default function AdminLoading(): React.JSX.Element {
  return (
    <SkeletonPage gap={6} header={<PageHeader overline="PULSE // ADMIN" title="Admin" />}>
      <div data-shell="wide">
        <AdminDashboardColumns
          tiles={
            // The catalog and AI tile groups — a heading and four tiles each (shown only at `lg:`).
            <>
              {["catalog", "ai"].map((group) => (
                <div key={group} className="flex min-w-0 flex-1 flex-col gap-4">
                  <Skeleton className="h-3 w-32" />
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {["one", "two", "three", "four"].map((key) => (
                      <Skeleton key={key} className="h-20 w-full rounded-md" />
                    ))}
                  </div>
                </div>
              ))}
            </>
          }
          publishing={
            <>
              {/* ACTIVE SKIN — the publisher card */}
              <div className="flex flex-col gap-4">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-28 w-full rounded-lg" />
              </div>
              {/* AVATAR UNIVERSE — the publisher card */}
              <div className="flex flex-col gap-4">
                <Skeleton className="h-3 w-36" />
                <Skeleton className="h-28 w-full rounded-lg" />
              </div>
            </>
          }
          operations={
            <>
              {/* CATALOG — the nav row into the admin exercise area */}
              <div className="flex flex-col gap-4">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-14 w-full rounded-lg" />
              </div>
              {/* AI — the nav row into the AI audit log */}
              <div className="flex flex-col gap-4">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-14 w-full rounded-lg" />
              </div>
              {/* CALLS BY GENERATOR KIND — six rows, shown only at `lg:` like the real list */}
              <div className="hidden lg:flex lg:flex-col lg:gap-4">
                <Skeleton className="h-3 w-44" />
                <Skeleton className="h-72 w-full rounded-lg" />
              </div>
            </>
          }
        />
      </div>
    </SkeletonPage>
  );
}
