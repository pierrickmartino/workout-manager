import { PageHeader } from "@/components/pulse/page-header";
import { Skeleton } from "@/components/pulse/skeleton";
import { SkeletonPage } from "@/components/pulse/skeleton-reveal";

// Layout-matched loading state for the Avatar picker (ADR-0123, ADR-0136): the grid of
// Avatar options, then the back link.
export default function AvatarPickerLoading(): React.JSX.Element {
  return (
    <SkeletonPage gap={6} header={<PageHeader overline="PULSE // OPERATOR" title="Choose your Avatar" />}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
      <Skeleton className="h-4 w-32" />
    </SkeletonPage>
  );
}
