import { apiGet, type Envelope } from "./api";

import type { AnalyticsOverview, AnalyticsRange } from "./analytics-types";

// Re-export the server-free types so server-side callers can import them from
// "@/lib/analytics". Client Components must import them directly from
// "@/lib/analytics-types" to avoid pulling this server-only module into the bundle.
export * from "./analytics-types";

// Server-side data access for the Analytics screen's count read model. The transport
// seam (lib/api.ts) attaches the Clerk JWT — it never reaches the browser; the FastAPI
// backend verifies it via JWKS, scopes the read to the owning user, and computes the
// range-scoped counts server-side. The range query string stays composed here, where
// its semantics live.
export async function fetchAnalytics(
  range: AnalyticsRange,
): Promise<Envelope<AnalyticsOverview>> {
  return apiGet(`/api/analytics?range=${range}`);
}
