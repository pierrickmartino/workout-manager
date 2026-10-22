import { cache } from "react";

import { apiGet, apiSend, type Envelope } from "./api";

import {
  DEFAULT_AVATAR_UNIVERSE,
  isAvatarUniverse,
  type AvatarUniverse,
} from "./avatar/avatar-art";

// Server-side data access for the global Avatar Universe (ADR-0137), the Active Skin's twin
// (lib/active-skin.ts): a single app-wide value that `GET` serves to any authenticated user —
// the root layout reads it each render to draw the header Avatar — and `PUT` publishes, gated
// to admins by the backend. The transport seam (lib/api.ts) attaches the Clerk JWT; it never
// reaches the browser.

// The wire shape of GET/PUT /api/avatar-universe's `data`. Typed as `string` because the wire
// carries a bare id; callers narrow it with `isAvatarUniverse`.
export interface AvatarUniverseSetting {
  universe: string;
}

export async function fetchAvatarUniverse(): Promise<Envelope<AvatarUniverseSetting>> {
  return apiGet("/api/avatar-universe");
}

// Publish a new Avatar Universe (admin only — the backend enforces the role gate).
export async function publishAvatarUniverse(
  universe: AvatarUniverse,
): Promise<Envelope<AvatarUniverseSetting>> {
  return apiSend("/api/avatar-universe", "PUT", { universe });
}

// Resolve the universe to draw Avatars in. Like `resolveActiveSkin` it runs on every request,
// including signed-out ones and while the backend is unreachable, so it never throws: any
// failure, or an id the frontend doesn't know, falls back to The Realm. Wrapped in React
// `cache` so every server component in one request shares a single round-trip.
export const resolveAvatarUniverse = cache(async (): Promise<AvatarUniverse> => {
  try {
    const envelope = await fetchAvatarUniverse();
    if (envelope.success && envelope.data && isAvatarUniverse(envelope.data.universe)) {
      return envelope.data.universe;
    }
  } catch {
    // Signed-out or transport failure — fall through to the default below.
  }
  return DEFAULT_AVATAR_UNIVERSE;
});
