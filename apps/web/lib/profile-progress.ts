import { apiGet, type Envelope } from "./api";

import type { ProfileProgress } from "./profile-progress-types";

// Re-export the server-free types so server-side callers can import them from
// "@/lib/profile-progress". Client Components must import them directly from
// "@/lib/profile-progress-types" to avoid pulling this server-only module into the
// browser bundle.
export * from "./profile-progress-types";

// Server-side data access for the Profile view's progress read model. The transport
// seam (lib/api.ts) attaches the Clerk JWT — it never reaches the browser; the FastAPI
// backend verifies it via JWKS, scopes the read to the owning user, and projects the
// figures server-side.
export async function fetchProfileProgress(): Promise<Envelope<ProfileProgress>> {
  return apiGet("/api/profile/progress");
}
