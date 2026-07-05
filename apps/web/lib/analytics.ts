import { auth } from "@clerk/nextjs/server";

import type { AnalyticsOverview, AnalyticsRange } from "./analytics-types";

// Re-export the server-free types so server-side callers can import them from
// "@/lib/analytics". Client Components must import them directly from
// "@/lib/analytics-types" to avoid pulling this server-only module into the bundle.
export * from "./analytics-types";

// Server-side data access for the Analytics screen's count read model. The Clerk
// JWT is attached here and never reaches the browser; the FastAPI backend
// verifies it via JWKS, scopes the read to the owning user, and computes the
// range-scoped counts server-side.
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

export async function fetchAnalytics(
  range: AnalyticsRange,
): Promise<Envelope<AnalyticsOverview>> {
  const response = await fetch(`${API_URL}/api/analytics?range=${range}`, {
    headers: await authHeaders(),
    cache: "no-store",
  });
  return (await response.json()) as Envelope<AnalyticsOverview>;
}
