import { PageHeader } from "@/components/pulse/page-header";
import { Skeleton } from "@/components/pulse/skeleton";

// Layout-matched loading state for Training history (ADR-0028): a vertical run
// of Logged Session cards.
export default function HistoryLoading(): React.JSX.Element {
  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // STATS" title="Training history" />

      <div className="flex flex-col gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    </section>
  );
}
