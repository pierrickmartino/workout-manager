"use server";

import { revalidatePath } from "next/cache";

import { publishAvatarUniverse } from "@/lib/avatar-universe";
import type { AvatarUniverse } from "@/lib/avatar/avatar-art";

// The thin server action behind the admin Avatar Universe publisher (ADR-0137). It publishes
// the chosen universe app-wide via PUT /api/avatar-universe (the backend enforces the
// `role=admin` gate — this is not a place to re-check admin) and then revalidates the root
// layout, whose header draws every user's Avatar in it. Other users see the new cast on their
// next navigation, bounded by the backend's short read-cache TTL. An unknown universe is
// rejected at the backend boundary and surfaces here as an error.
export interface PublishAvatarUniverseResult {
  error: string | null;
}

export async function publishUniverse(
  universe: AvatarUniverse,
): Promise<PublishAvatarUniverseResult> {
  const result = await publishAvatarUniverse(universe);
  if (!result.success) {
    return { error: result.error ?? "Could not publish the Avatar Universe." };
  }
  revalidatePath("/", "layout");
  return { error: null };
}
