// Shared metric-history types. This module has NO server-only imports, so it is
// safe to import from both Server and Client Components. The server-only data
// access (Clerk auth + fetch) lives in `lib/metrics.ts`.

// A single dated body-metric reading — weight, body-fat, waist, etc. This is the
// time series the Fitness Profile snapshot deliberately is not: the Profile's
// "now" is never overwritten by these records.
export interface MetricEntry {
  id: number;
  clerk_user_id: string;
  metric: string;
  value: number;
  unit: string | null;
  recorded_on: string;
}

// The request the user submits to record one reading.
export interface RecordMetricInput {
  metric: string;
  value: number;
  unit: string | null;
  recorded_on: string;
}
