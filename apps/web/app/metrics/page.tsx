import { RecordMetricForm } from "@/components/RecordMetricForm";
import { fetchMetrics, type MetricEntry } from "@/lib/metrics";
import { PageHeader } from "@/components/pulse/page-header";
import { SectionHeader } from "@/components/pulse/section-header";
import { Alert } from "@/components/pulse/alert";
import { Card } from "@/components/ui/card";

// The metric-history view (Slice 12): record dated body-metric readings and review
// them as a time series. This is deliberately distinct from the Fitness Profile
// snapshot — these records are never folded back into the Profile's "now". An
// optional ?metric= filter narrows both the history and the form's default metric.
export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ metric?: string }>;
}) {
  const { metric } = await searchParams;
  const envelope = await fetchMetrics(metric);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // STATS" title="Metric history" />
      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        Track your weight or other metrics over time. These readings are kept as
        a history, separate from your current profile.
      </p>

      <RecordMetricForm today={today} defaultMetric={metric ?? "weight"} />

      <div className="flex flex-col gap-4">
        <SectionHeader meta={metric ? metric.toUpperCase() : undefined}>
          HISTORY
        </SectionHeader>

        {!envelope.success || !envelope.data ? (
          <Alert tone="error">
            Could not load your readings: {envelope.error ?? "unknown error"}
          </Alert>
        ) : envelope.data.length === 0 ? (
          <Card className="p-6">
            <p className="font-sans text-sm text-text-secondary">
              No readings recorded yet.
            </p>
          </Card>
        ) : (
          <MetricTable entries={envelope.data} />
        )}
      </div>
    </section>
  );
}

function MetricTable({ entries }: { entries: MetricEntry[] }) {
  return (
    <Card className="flex flex-col gap-1.5 p-4">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-3 px-2">
        <span className="label-mono text-[9px] text-text-muted">Date</span>
        <span className="label-mono text-[9px] text-text-muted">Metric</span>
        <span className="label-mono text-[9px] text-text-muted">Value</span>
      </div>
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="grid grid-cols-[1fr_1fr_auto] items-center gap-3 rounded-sm border border-border bg-base/40 px-3 py-2.5"
        >
          <span className="font-mono text-[13px] text-text-secondary">
            {entry.recorded_on}
          </span>
          <span className="font-sans text-[13px] capitalize text-text-primary">
            {entry.metric}
          </span>
          <span className="text-right font-display text-sm font-semibold text-text-primary">
            {entry.value}
            {entry.unit ? (
              <span className="ml-1 font-mono text-[11px] font-normal text-text-muted">
                {entry.unit}
              </span>
            ) : null}
          </span>
        </div>
      ))}
    </Card>
  );
}
