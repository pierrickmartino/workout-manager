import { PageHeader } from "@/components/pulse/page-header";
import { Skeleton } from "@/components/pulse/skeleton";

// Layout-matched loading state for the admin Exercise editor (ADR-0028). Its three reads now
// settle together behind the admin gate (perf audit A2), but the gate plus that settle is still
// two round trips the curator waited out on a blank screen.
//
// Both the overline and the title are static here, so the real header paints — only the stacked
// editor cards are skeletonized, at the heights they render.
export default function AdminExerciseEditorLoading(): React.JSX.Element {
  return (
    <section className="flex flex-col gap-8">
      <PageHeader overline="PULSE // ADMIN" title="Edit exercise" />

      {/* The descriptive paragraph above the editor */}
      <Skeleton className="h-10 w-full" />

      {/* Descriptive editor, image, curation, relationships, enrich, retire, delete */}
      <Skeleton className="h-72 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-lg" />

      {/* Audit trail */}
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-12 w-full rounded-sm" />
        <Skeleton className="h-12 w-full rounded-sm" />
      </div>
    </section>
  );
}
