import "server-only";

import { fetchAdminExercises } from "./admin-exercises";
import { fetchCompletenessBreakdown } from "./catalog-completeness-breakdown";
import { fetchGenerationCallSummary } from "./admin-generation-calls";
import { adminDashboardView, type AdminDashboardView } from "./admin-dashboard-view";

// Server-side data access for the admin home dashboard (ADR-0142). Call it only after the
// admin gate: the reads are admin-gated on the backend too (ADR-0046), and the JWT stays
// server-side (lib/api.ts). Re-export the server-free view-model so server callers can import
// it from one place.
export * from "./admin-dashboard-view";

// Read every dashboard input in parallel and project them into tile groups. Each read is
// settled on its own, so a rejection (a transport failure, which `apiGet` throws rather than
// returns) becomes a failed input for its group instead of failing the page — the publishers
// and links beside the tiles never depend on a metric loading.
export async function fetchAdminDashboard(): Promise<AdminDashboardView> {
  // A bare `.catch` rather than `settleBestEffort`: that seam narrows the envelope to
  // `{ success, data }`, and the failed group's inline message wants the backend's `error`.
  const [completeness, catalog, generationCalls] = await Promise.all([
    fetchCompletenessBreakdown().catch(() => null),
    fetchAdminExercises().catch(() => null),
    fetchGenerationCallSummary().catch(() => null),
  ]);
  return adminDashboardView({ completeness, catalog, generationCalls });
}
