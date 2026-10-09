import { PageHeader } from "@/components/pulse/page-header";
import { Skeleton } from "@/components/pulse/skeleton";
import { SkeletonPage } from "@/components/pulse/skeleton-reveal";

// Layout-matched loading state for Profile (ADR-0028): the lifetime Bento of
// stat tiles followed by the Training Passport summary.
export default function ProfileLoading(): React.JSX.Element {
  return (
    <SkeletonPage gap={6} header={<PageHeader overline="PULSE // OPERATOR" title="Profile" />}>
      {/* Lifetime stats Bento */}
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-24" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="col-span-2 h-20 w-full" />
        </div>
      </div>

      {/* Training Passport summary: earned Stamps, then the next milestone */}
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-32" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
        <Skeleton className="h-28 w-full" />
      </div>
    </SkeletonPage>
  );
}
