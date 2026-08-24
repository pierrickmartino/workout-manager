import { cache } from "react";

import { apiGet, apiSend, type Envelope } from "./api";

import { DEFAULT_MODE, type Mode } from "./theme";

// Server-side data access for the per-user Interface Preference (Mode + Keep
// Screen Awake). The transport seam (lib/api.ts) attaches the Clerk JWT — it never
// reaches the browser; the FastAPI backend verifies it via JWKS and scopes the
// read/write to the owning user. The Interface Preference is stored apart from the
// Fitness Profile (ADR-0047), hence its own data-access module. The physical
// `/api/appearance` path stays even though the concept generalised past appearance
// (ADR-0055).

// The wire shape of GET/PUT /api/appearance's `data`: the stored Mode plus whether
// to Keep Screen Awake during a Live Session (defaults on, ADR-0055).
export interface Appearance {
  mode: Mode;
  keep_screen_awake: boolean;
}

export async function fetchAppearance(): Promise<Envelope<Appearance>> {
  return apiGet("/api/appearance");
}

// Each save sends only its own facet: the backend PUT merges it onto the user's
// current preference, so persisting the Mode never disturbs Keep Screen Awake and
// vice versa (ADR-0055).
export async function saveAppearanceMode(
  mode: Mode,
): Promise<Envelope<Appearance>> {
  return apiSend("/api/appearance", "PUT", { mode });
}

export async function saveKeepScreenAwake(
  keepScreenAwake: boolean,
): Promise<Envelope<Appearance>> {
  return apiSend("/api/appearance", "PUT", { keep_screen_awake: keepScreenAwake });
}

// Resolve the Mode to render the app in, for the root layout's first paint. This
// runs on every request, including for signed-out visitors and if the backend is
// briefly unreachable, so it can never throw: any failure falls back to the
// shipped default (Dark), preserving today's look rather than crashing the shell.
//
// Wrapped in React `cache` so the layout and the `/profile` page — which both need
// the Mode and render within the same server request — share a single
// GET /api/appearance round-trip instead of each issuing their own.
export const resolveUserMode = cache(async (): Promise<Mode> => {
  try {
    const envelope = await fetchAppearance();
    if (envelope.success && envelope.data) {
      return envelope.data.mode;
    }
  } catch {
    // Signed-out or transport failure — fall through to the default below.
  }
  return DEFAULT_MODE;
});
