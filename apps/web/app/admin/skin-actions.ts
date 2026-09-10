"use server";

import { revalidatePath } from "next/cache";

import { publishActiveSkin } from "@/lib/active-skin";
import type { Skin } from "@/lib/theme";

// The thin server action behind the admin Skin publisher. It publishes the chosen
// Skin as the global Active Skin via PUT /api/active-skin (the backend enforces the
// `role=admin` gate — this is not a place to re-check admin) and then revalidates
// the root layout, which reads the Active Skin server-side
// (lib/active-skin.resolveActiveSkin). Other users pick the new Active Skin up on
// their next navigation, bounded by the backend's short read-cache TTL. An unknown
// Skin id is rejected at the backend boundary and surfaces here as an error.
export interface PublishSkinResult {
  error: string | null;
}

export async function publishSkin(skin: Skin): Promise<PublishSkinResult> {
  const result = await publishActiveSkin(skin);
  if (!result.success) {
    return { error: result.error ?? "Could not publish the Skin." };
  }

  // Re-render everything under the root layout so the stamped `data-skin` reflects
  // the newly published Active Skin on the very next render.
  revalidatePath("/", "layout");
  return { error: null };
}
