import { auth } from "@clerk/nextjs/server";

import type { MetricEntry, RecordMetricInput } from "./metrics-types";

// Re-export the server-free types so server-side callers can keep importing them
// from "@/lib/metrics". Client Components must import them directly from
// "@/lib/metrics-types" to avoid pulling this server-only module into the browser.
export * from "./metrics-types";

// Server-side data access for the metric history. The Clerk JWT is attached here
// and never reaches the browser; the FastAPI backend verifies it via JWKS, scopes
// every reading to the owning user, and keeps these records separate from the
// mutable Fitness Profile snapshot.
const API_URL = process.env.API_URL ?? "http://localhost:8000";

interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { getToken } = await auth();
  const token = await getToken();
  return { Authorization: `Bearer ${token}` };
}

export async function recordMetric(
  input: RecordMetricInput,
): Promise<Envelope<MetricEntry>> {
  const response = await fetch(`${API_URL}/api/metrics`, {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  return (await response.json()) as Envelope<MetricEntry>;
}

export async function fetchMetrics(
  metric?: string,
): Promise<Envelope<MetricEntry[]>> {
  const query = metric ? `?metric=${encodeURIComponent(metric)}` : "";
  const response = await fetch(`${API_URL}/api/metrics${query}`, {
    headers: await authHeaders(),
    cache: "no-store",
  });
  return (await response.json()) as Envelope<MetricEntry[]>;
}
