import { apiGet, type Envelope } from "./api";

import type { AvatarCatalog } from "./avatar/avatar-picker";

// Server-side data access for the Avatar picker (ADR-0136). The transport seam (lib/api.ts)
// attaches the Clerk JWT — it never reaches the browser; the backend computes the user's
// Operator Level from their Logged Sessions and serves the catalog with each entry's lock state.
export async function fetchAvatars(): Promise<Envelope<AvatarCatalog>> {
  return apiGet("/api/avatars");
}
