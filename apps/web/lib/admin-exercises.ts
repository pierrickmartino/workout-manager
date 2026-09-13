import "server-only";

import { apiGet, type Envelope } from "./api";
import type { AdminExerciseRow } from "./admin-exercises-view";

// Server-side data access for the admin catalog browser (issue #501, ADR-0075/0076). The
// endpoint is gated by `require_admin` on the backend; the transport seam (lib/api.ts)
// attaches the Clerk JWT, which never reaches the browser — so this is called only from a
// server component, never a Client Component. Re-export the server-free view-model so
// server callers can import it from one place.
export * from "./admin-exercises-view";

// The whole shared Catalog for the ops view — every Provenance and Completeness tier
// (Stubs included) and both retired and active rows, each carrying its computed tier and
// retired state. The catalog is a bounded shared set, so we pull one generous page and the
// client filters/searches it instantly; the backend still owns the filter contract. Sorted
// A→Z by name. Returns the standard paginated envelope.
export async function fetchAdminExercises(): Promise<Envelope<AdminExerciseRow[]>> {
  return apiGet("/api/admin/exercises?limit=500");
}
