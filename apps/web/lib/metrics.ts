import { apiGet, apiSend, type Envelope } from "./api";

import type { MetricEntry, RecordMetricInput } from "./metrics-types";

// Re-export the server-free types so server-side callers can keep importing them
// from "@/lib/metrics". Client Components must import them directly from
// "@/lib/metrics-types" to avoid pulling this server-only module into the browser.
export * from "./metrics-types";

// Server-side data access for the metric history. The transport seam (lib/api.ts)
// attaches the Clerk JWT — it never reaches the browser; the FastAPI backend verifies
// it via JWKS, scopes every reading to the owning user, and keeps these records
// separate from the mutable Fitness Profile snapshot. The optional metric filter is
// encoded here, where its URL semantics live.
export async function recordMetric(
  input: RecordMetricInput,
): Promise<Envelope<MetricEntry>> {
  return apiSend("/api/metrics", "POST", input);
}

export async function fetchMetrics(
  metric?: string,
): Promise<Envelope<MetricEntry[]>> {
  const query = metric ? `?metric=${encodeURIComponent(metric)}` : "";
  return apiGet(`/api/metrics${query}`);
}
