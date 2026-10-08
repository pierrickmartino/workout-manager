import { PageHeader } from "@/components/pulse/page-header";
import { Skeleton } from "@/components/pulse/skeleton";
import { SkeletonPage } from "@/components/pulse/skeleton-reveal";

// Layout-matched loading state for the Protocol Builder (ADR-0028). It overrides the
// `/protocols/[id]` boundary rather than inheriting it: the builder's overline is BUILDER, its
// action is the week count, and its first block is the config card, so the parent's skeleton
// would name the wrong screen while the user waited on it.
export default function ProtocolBuilderLoading(): React.JSX.Element {
  return (
    <SkeletonPage gap={7} header={<PageHeader overline="PULSE // BUILDER" title="Protocol builder" />}>
      {/* Config card */}
      <Skeleton className="h-32 w-full rounded-lg" />

      {/* Session composition — the staged Sessions the user reorders */}
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>

      {/* DEPLOY PROTOCOL */}
      <Skeleton className="h-10 w-full rounded-md" />
    </SkeletonPage>
  );
}
