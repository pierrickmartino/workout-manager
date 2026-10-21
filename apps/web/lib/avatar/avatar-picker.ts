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
  // Progress toward `unlock_level`: the user's Operator Level, held there once reached.
  current_level: number;
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
  // Whether the user's Operator Level hasn't reached this Avatar yet, so it can't be chosen.
  // An Avatar kept after the level dropped is both selected and locked (ADR-0136).
  readonly locked: boolean;
  // A locked Avatar's progress toward its unlock level ("LVL 5 / 8"); null once unlocked.
  readonly progress: string | null;
  // What a screen reader announces for the option; the artwork itself is decorative.
  readonly label: string;
}

// Map the catalog to the picker's options, in catalog order, marking exactly the user's
// current Avatar as selected. Lock state is the backend's; this only words it. Pure: same
// input, same output.
export function buildAvatarOptions(
  catalog: AvatarCatalog,
  currentAvatarId: string,
): AvatarOption[] {
  return catalog.avatars.map((entry) => {
    const locked = !entry.unlocked;
    return {
      id: entry.id,
      name: entry.name,
      art: headerAvatar(entry.id),
      selected: entry.id === currentAvatarId,
      locked,
      progress: locked ? `LVL ${entry.current_level} / ${entry.unlock_level}` : null,
      label: locked ? `${entry.name}, locked, reach LVL ${entry.unlock_level}` : entry.name,
    };
  });
}
