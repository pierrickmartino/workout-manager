import { apiGet, type Envelope } from "./api";

import type { HomeData } from "./home-types";

// Re-export the server-free types so server-side callers can import them from
// "@/lib/home". Client Components must import them directly from
// "@/lib/home-types" to avoid pulling this server-only module into the bundle.
export * from "./home-types";

// Server-side data access for the Home screen's aggregated read. The transport seam
// (lib/api.ts) attaches the Clerk JWT — it never reaches the browser; the FastAPI
// backend verifies it via JWKS and computes Readiness server-side (ADR-0008).
export async function fetchHome(): Promise<Envelope<HomeData>> {
  return apiGet("/api/home");
}
