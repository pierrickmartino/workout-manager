import { apiGet, type Envelope } from "./api";

import type { TrainingHeatmap } from "./heatmap-types";

// Re-export the server-free types so server-side callers can import them from
// "@/lib/heatmap". Client Components must import them directly from
// "@/lib/heatmap-types" to avoid pulling this server-only module into the browser bundle.
export * from "./heatmap-types";

// Server-side data access for the Profile Training Heatmap (#378, ADR-0054). The transport
// seam (lib/api.ts) attaches the Clerk JWT — it never reaches the browser; the FastAPI
// backend verifies it via JWKS, scopes the read to the owning user, and projects the
// trailing ~53-week grid server-side. A deliberately separate endpoint from
// `/api/profile/progress`, so the always-fetched progress payload stays lean and the
// ~371-cell series is fetched only when the Heatmap is wanted.
export async function fetchTrainingHeatmap(): Promise<Envelope<TrainingHeatmap>> {
  return apiGet("/api/profile/heatmap");
}
