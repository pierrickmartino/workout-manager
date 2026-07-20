import { apiGet, type Envelope } from "./api";

import type { StrengthAnalyticsOverview } from "./strength-analytics-types";

// Re-export the server-free types so server-side callers can import them from
// "@/lib/strength-analytics". Client Components must import them directly from
// "@/lib/strength-analytics-types" to avoid pulling this server-only module into the
// bundle.
export * from "./strength-analytics-types";

// Server-side data access for the Strength Analytics screen's PR timeline. The transport
// seam (lib/api.ts) attaches the Clerk JWT — it never reaches the browser; the FastAPI
// backend verifies it via JWKS, scopes the read to the owning user, and paginates the
// timeline server-side. The `limit`/`offset` query string stays composed here, where its
// semantics live; the envelope's `meta` carries the full total back for the pager.
export async function fetchStrengthAnalytics(
  limit: number,
  offset: number,
): Promise<Envelope<StrengthAnalyticsOverview>> {
  return apiGet(`/api/analytics/strength?limit=${limit}&offset=${offset}`);
}
