// The Avatar artwork (ADR-0136, ADR-0137): one portrait per catalog Avatar in each Avatar
// Universe, served from `public/avatars/<universe>/<id>.webp`. The backend owns the catalog and
// the universe list (`apps/api/app/domain/avatars.py`); this module owns the art, keyed by the
// same ids and universes in the same order. The committed `manifest.json` beside it lists both,
// the API-side contract test holds it to the backend, and `avatar-art.test.ts` checks every
// portrait file exists.
//
// Each Avatar keeps a signature accent, an existing Skin token, for the ring around its
// portrait, so the frame still follows the Skin and Mode. The art is decorative; the header
// link's text names its purpose.
//
// No I/O and no server-only imports, so Server Components use it and it is unit-tested alone.

// The Avatar a user has until they choose one, mirroring the backend's `DEFAULT_AVATAR_ID`.
export const DEFAULT_AVATAR_ID = "novice";

// The catalog ids, in catalog order.
export const AVATAR_IDS = [
  "novice",
  "dwarf-lifter",
  "elf-ranger",
  "monk",
  "barbarian",
  "valkyrie",
  "paladin",
  "titan",
] as const;

export type AvatarId = (typeof AVATAR_IDS)[number];

// The Avatar Universes, in the order the admin lists them, mirroring the backend's
// `AVATAR_UNIVERSES`: The Realm (fantasy), Orbit (a deep-space crew), Olympus (myth).
export const AVATAR_UNIVERSES = ["realm", "orbit", "olympus"] as const;

export type AvatarUniverse = (typeof AVATAR_UNIVERSES)[number];

// The universe shown until an admin publishes another, mirroring `DEFAULT_AVATAR_UNIVERSE`.
export const DEFAULT_AVATAR_UNIVERSE: AvatarUniverse = "realm";

// The portraits' intrinsic size in px: square WebP files, downscaled from the generator.
export const AVATAR_PORTRAIT_PX = 512;

// Each Avatar's signature accent: an existing Skin token, already measured in every Skin and
// Mode (ADR-0081). Drawn as the ring around the portrait.
export type AvatarAccent = "cyan" | "blue" | "violet" | "magenta" | "amber" | "green";

const AVATAR_ACCENTS: Readonly<Record<AvatarId, AvatarAccent>> = {
  novice: "cyan",
  "dwarf-lifter": "amber",
  "elf-ranger": "green",
  monk: "violet",
  barbarian: "magenta",
  valkyrie: "blue",
  paladin: "amber",
  titan: "cyan",
};

export interface AvatarArt {
  readonly id: AvatarId;
  readonly universe: AvatarUniverse;
  readonly accent: AvatarAccent;
  // The portrait's public path.
  readonly src: string;
}

function isAvatarId(value: string): value is AvatarId {
  return (AVATAR_IDS as readonly string[]).includes(value);
}

export function isAvatarUniverse(value: unknown): value is AvatarUniverse {
  return typeof value === "string" && (AVATAR_UNIVERSES as readonly string[]).includes(value);
}

// The portrait of `avatarId` in `universe`. Both fall back like the API reads them: an unknown
// or missing Avatar is the Novice and an unknown universe is The Realm, so a shell rendered
// against an older or newer catalog still draws a figure rather than a broken image.
export function avatarArt(
  avatarId: string | undefined,
  universe: string | undefined,
): AvatarArt {
  const id = avatarId !== undefined && isAvatarId(avatarId) ? avatarId : DEFAULT_AVATAR_ID;
  const world = isAvatarUniverse(universe) ? universe : DEFAULT_AVATAR_UNIVERSE;
  return {
    id,
    universe: world,
    accent: AVATAR_ACCENTS[id],
    src: `/avatars/${world}/${id}.webp`,
  };
}
