// The Avatar picker's view-model (ADR-0136): maps the GET /api/avatars catalog and the
// user's current Avatar into the radio options the picker page renders, so the page stays
// thin. The backend owns the catalog and its unlock rule; this module only shapes it.
//
// No I/O and no server-only imports, so the client picker uses it and it is unit-tested alone.

import { headerAvatar, type AvatarArt } from "./avatar-art.ts";

// One catalog entry as GET /api/avatars serves it.
export interface AvatarCatalogEntry {
  id: string;
  name: string;
  unlock_level: number;
  unlocked: boolean;
}

// The wire shape of GET /api/avatars's `data`: the user's Operator Level, computed from
// their Logged Sessions, and the whole catalog in display order.
export interface AvatarCatalog {
  operator_level: number;
  avatars: AvatarCatalogEntry[];
}

// One radio option in the picker.
export interface AvatarOption {
  readonly id: string;
  // The character name shown under the artwork.
  readonly name: string;
  readonly art: AvatarArt;
  readonly selected: boolean;
  // What a screen reader announces for the option; the artwork itself is decorative.
  readonly label: string;
}

// Map the catalog to the picker's options, in catalog order, marking exactly the user's
// current Avatar as selected. Pure: same input, same output.
export function buildAvatarOptions(
  catalog: AvatarCatalog,
  currentAvatarId: string,
): AvatarOption[] {
  return catalog.avatars.map((entry) => ({
    id: entry.id,
    name: entry.name,
    art: headerAvatar(entry.id),
    selected: entry.id === currentAvatarId,
    label: entry.name,
  }));
}
