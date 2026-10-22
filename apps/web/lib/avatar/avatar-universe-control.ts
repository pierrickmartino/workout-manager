// The admin Avatar Universe control's view-model (ADR-0137): the fixed list of universes, which
// one is published, which one the admin has picked, and the eight portraits each would show,
// so the admin can see a cast before publishing it to everyone. Unlike the Skin control
// (lib/appearance-view.ts) a pick restyles nothing: the preview is the row of portraits itself.
//
// No I/O and no server-only imports, so the client publisher uses it and it is unit-tested alone.

import {
  AVATAR_IDS,
  AVATAR_UNIVERSES,
  avatarArt,
  type AvatarArt,
  type AvatarUniverse,
} from "./avatar-art.ts";

export interface AvatarUniverseOption {
  readonly value: AvatarUniverse;
  readonly label: string;
  readonly caption: string;
  // The universe every user sees now.
  readonly isActive: boolean;
  // The universe the admin has picked to publish (equal to the active one when none is).
  readonly isPicked: boolean;
  // The whole cast in catalog order, as this universe draws it.
  readonly cast: readonly AvatarArt[];
}

export interface AvatarUniverseControl {
  readonly options: readonly AvatarUniverseOption[];
  // Whether the pick differs from what is published, so Publish and Cancel have work to do.
  readonly hasPendingPick: boolean;
}

const UNIVERSE_COPY: Readonly<Record<AvatarUniverse, { label: string; caption: string }>> = {
  realm: { label: "The Realm", caption: "Fantasy heroes, from Novice to Titan" },
  orbit: { label: "Orbit", caption: "The crew of a deep-space station" },
  olympus: { label: "Olympus", caption: "Figures of the ancient games and myth" },
};

// Build the control from the published universe and the admin's pick. Pure: same inputs, same
// output.
export function buildAvatarUniverseControl(
  active: AvatarUniverse,
  picked: AvatarUniverse,
): AvatarUniverseControl {
  return {
    options: AVATAR_UNIVERSES.map((universe) => ({
      value: universe,
      ...UNIVERSE_COPY[universe],
      isActive: universe === active,
      isPicked: universe === picked,
      cast: AVATAR_IDS.map((id) => avatarArt(id, universe)),
    })),
    hasPendingPick: picked !== active,
  };
}
