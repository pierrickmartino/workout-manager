import "server-only";

import { fetchRetiredExercisePage } from "./admin-exercises";
import { fetchCompletenessBreakdown } from "./catalog-completeness-breakdown";
import { fetchGenerationCallSummary } from "./admin-generation-calls";
import {
  adminDashboardView,
  rejectedRead,
  type AdminDashboardView,
  type DashboardRead,
} from "./admin-dashboard-view";

// Server-side data access for the admin home dashboard (ADR-0142). Call it only after the
// admin gate: the reads are admin-gated on the backend too (ADR-0046), and the JWT stays
// server-side (lib/api.ts). Re-export the server-free view-model so server callers can import
// it from one place.
export * from "./admin-dashboard-view";

// Settle one dashboard read. `apiGet` rejects on a transport failure rather than returning an
// envelope; the catch keeps that from failing the page (a metric is optional, ADR-0088), logs
// the error server-side so it is not lost, and hands the view a failed read with a real reason.
// Not `settleBestEffort`: that seam narrows the envelope to `{ success, data }` and drops the
// `error` (and `meta`) the failed group's inline message and the Retired total need.
function settleDashboardRead<R extends DashboardRead<unknown>>(
  name: string,
  read: Promise<R>,
): Promise<R | DashboardRead<never>> {
  return read.catch((error: unknown) => {
    console.error(`admin dashboard: the ${name} read failed`, error);
    return rejectedRead();
  });
}

// Read every dashboard input in parallel and project them into tile groups. Each read is
// settled on its own, so a rejection becomes a failed input for its group instead of failing
// the page — the publishers and links beside the tiles never depend on a metric loading.
export async function fetchAdminDashboard(): Promise<AdminDashboardView> {
  const [completeness, retired, generationCalls] = await Promise.all([
    settleDashboardRead("completeness breakdown", fetchCompletenessBreakdown()),
    settleDashboardRead("retired Exercise total", fetchRetiredExercisePage()),
    settleDashboardRead("Generation Call summary", fetchGenerationCallSummary()),
  ]);
  return adminDashboardView({ completeness, retired, generationCalls });
}
