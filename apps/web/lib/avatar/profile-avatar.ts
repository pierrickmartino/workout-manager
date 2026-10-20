// Profile's Avatar (ADR-0136): the user's stored Avatar, drawn larger than the header's and
// named. The art comes from `avatar-art`; the character name comes from the GET /api/avatars
// catalog, since the backend owns the catalog and this app keeps no second copy of its names.
//
// No I/O and no server-only imports, so Server Components use it and it is unit-tested alone.

import { DEFAULT_AVATAR_ID, headerAvatar, type AvatarArt } from "./avatar-art.ts";
import type { AvatarCatalog } from "./avatar-picker.ts";

export interface ProfileAvatar {
  readonly art: AvatarArt;
  // The character name shown beside the art, or `null` when the catalog could not be read.
  readonly name: string | null;
}

// The Avatar Profile shows for the stored id. It falls back to the Novice exactly as the
// header does, and also when the catalog no longer serves the id, so the art and the name
// never name different characters. Without the catalog it still draws the header's figure.
export function profileAvatar(
  avatarId: string | undefined,
  catalog: AvatarCatalog | null,
): ProfileAvatar {
  const art = headerAvatar(avatarId);
  if (catalog === null) {
    return { art, name: null };
  }
  const entry = catalog.avatars.find((avatar) => avatar.id === art.id);
  if (entry !== undefined) {
    return { art, name: entry.name };
  }
  const novice = catalog.avatars.find((avatar) => avatar.id === DEFAULT_AVATAR_ID);
  return { art: headerAvatar(DEFAULT_AVATAR_ID), name: novice?.name ?? null };
}
