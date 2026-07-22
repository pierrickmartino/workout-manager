import { PageHeader } from "@/components/pulse/page-header";
import { Skeleton } from "@/components/pulse/skeleton";

// Layout-matched loading state for Profile (ADR-0028): the lifetime Bento of
// stat tiles followed by the achievements preview grid.
export default function ProfileLoading(): React.JSX.Element {
  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // OPERATOR" title="Profile" />

      {/* Lifetime stats Bento */}
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-24" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="col-span-2 h-20 w-full" />
        </div>
      </div>

      {/* Achievements preview */}
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-32" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </section>
  );
}
