import Link from "next/link";

import { RecordMetricForm } from "@/components/RecordMetricForm";
import { fetchMetrics, type MetricEntry } from "@/lib/metrics";

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
    <section>
      <h1>Metric history</h1>
      <p>
        Track your weight or other metrics over time. These readings are kept as a
        history, separate from your current profile.
      </p>

      <RecordMetricForm today={today} defaultMetric={metric ?? "weight"} />

      <h2 style={{ marginTop: "2rem" }}>
        {metric ? `History — ${metric}` : "History"}
      </h2>

      {!envelope.success || !envelope.data ? (
        <p role="alert">
          Could not load your readings: {envelope.error ?? "unknown error"}
        </p>
      ) : envelope.data.length === 0 ? (
        <p>No readings recorded yet.</p>
      ) : (
        <MetricTable entries={envelope.data} />
      )}

      <p style={{ marginTop: "1.5rem" }}>
        <Link href="/dashboard">← Back to dashboard</Link>
      </p>
    </section>
  );
}

function MetricTable({ entries }: { entries: MetricEntry[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th style={{ textAlign: "left", paddingRight: "1rem" }}>Date</th>
          <th style={{ textAlign: "left", paddingRight: "1rem" }}>Metric</th>
          <th style={{ textAlign: "left" }}>Value</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.id}>
            <td style={{ paddingRight: "1rem" }}>{entry.recorded_on}</td>
            <td style={{ paddingRight: "1rem" }}>{entry.metric}</td>
            <td>
              {entry.value}
              {entry.unit ? ` ${entry.unit}` : ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
