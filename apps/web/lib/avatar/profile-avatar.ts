// Profile's Avatar (ADR-0136, ADR-0137): the user's stored Avatar, drawn larger than the
// header's and named. The character name comes from the GET /api/avatars catalog, since the
// backend owns the catalog and this app keeps no second copy of its names; the portrait is
// drawn from the universe that catalog was named in, or the universe the header uses when the
// catalog could not be read.
//
// No I/O and no server-only imports, so Server Components use it and it is unit-tested alone.

import { avatarArt, type AvatarArt } from "./avatar-art.ts";
import type { AvatarCatalog } from "./avatar-picker.ts";

export interface ProfileAvatarView {
  readonly art: AvatarArt;
  // The character name shown beside the art, or `null` when the catalog names no such Avatar
  // (it could not be read, or drifted from the art).
  readonly name: string | null;
}

// The Avatar Profile shows for the stored id: the header's portrait, with the Novice fallback
// exactly as the header resolves it, named by the catalog entry for that portrait.
export function profileAvatar(
  avatarId: string | undefined,
  catalog: AvatarCatalog | null,
  fallbackUniverse: string,
): ProfileAvatarView {
  const art = avatarArt(avatarId, catalog?.universe ?? fallbackUniverse);
  const entry = catalog?.avatars.find((avatar) => avatar.id === art.id);
  return { art, name: entry?.name ?? null };
}
