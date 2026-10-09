import { PageHeader } from "@/components/pulse/page-header";
import { Skeleton } from "@/components/pulse/skeleton";
import { SkeletonPage } from "@/components/pulse/skeleton-reveal";

// Layout-matched loading state for one Stamp's page (#652): the detail card under the header.
export default function StampLoading(): React.JSX.Element {
  return (
    <SkeletonPage gap={6} header={<PageHeader overline="PULSE // STAMP" title="Stamp" />}>
      <Skeleton className="h-32 w-full" />
    </SkeletonPage>
  );
}
