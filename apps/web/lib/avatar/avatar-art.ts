// The Avatar artwork (ADR-0136): one hand-made SVG figure per catalog Avatar, drawn as plain
// paths in a fixed square space. The backend owns the catalog (`apps/api/app/domain/avatars.py`);
// this module owns the art, keyed by the same ids in the same order. The committed
// `manifest.json` beside it lists those ids, and the API-side contract test fails when the two
// drift apart.
//
// Every shape names a tone, never a colour: the component maps each tone to an opaque Skin
// token, so a figure renders in every Skin and Mode with no raster asset, no AI-generated art
// and no network origin. The art is decorative; the header link's text names its purpose.
//
// No I/O and no server-only imports, so Server Components use it and it is unit-tested alone.

export const AVATAR_VIEWBOX = 100;

// The Avatar a user has until they choose one, mirroring the backend's `DEFAULT_AVATAR_ID`.
export const DEFAULT_AVATAR_ID = "novice";

// The ink tones a figure is painted in, mapped to Skin tokens by `components/pulse/avatar.tsx`.
// `hollow` is the page colour, for the shadow inside a hood or a pair of eyes.
export type AvatarTone = "primary" | "secondary" | "muted" | "accent" | "hollow";

// Each Avatar's signature accent: an existing Skin token, already measured in every Skin and
// Mode (ADR-0081).
export type AvatarAccent = "cyan" | "amber" | "green";

export interface AvatarShape {
  readonly tone: AvatarTone;
  // An SVG path in the `AVATAR_VIEWBOX` square.
  readonly d: string;
}

export interface AvatarArt {
  readonly id: string;
  readonly accent: AvatarAccent;
  // Painted in order, back to front.
  readonly shapes: readonly AvatarShape[];
}

const NOVICE: AvatarArt = {
  id: "novice",
  accent: "cyan",
  shapes: [
    // Robe and hood
    { tone: "muted", d: "M14 100C18 74 34 64 50 64C66 64 82 74 86 100Z" },
    {
      tone: "muted",
      d: "M50 16C33 16 24 32 24 48C24 60 30 68 36 72L64 72C70 68 76 60 76 48C76 32 67 16 50 16Z",
    },
    // The shadow inside the hood, and the eyes glowing in it
    { tone: "hollow", d: "M50 30C40 30 35 40 35 50C35 60 42 66 50 66C58 66 65 60 65 50C65 40 60 30 50 30Z" },
    { tone: "accent", d: "M41 48H47V52H41Z" },
    { tone: "accent", d: "M53 48H59V52H53Z" },
    // Robe clasp
    { tone: "accent", d: "M46 76H54V84H46Z" },
  ],
};

const DWARF_LIFTER: AvatarArt = {
  id: "dwarf-lifter",
  accent: "amber",
  shapes: [
    // Broad shoulders
    { tone: "muted", d: "M8 100C10 76 28 68 50 68C72 68 90 76 92 100Z" },
    // Face, horned helmet and eyes
    { tone: "secondary", d: "M50 26C38 26 32 34 32 46C32 56 38 62 50 62C62 62 68 56 68 46C68 34 62 26 50 26Z" },
    { tone: "primary", d: "M30 42C30 26 39 18 50 18C61 18 70 26 70 42Z" },
    { tone: "primary", d: "M31 36C22 34 18 26 20 14C24 23 28 27 34 29Z" },
    { tone: "primary", d: "M69 36C78 34 82 26 80 14C76 23 72 27 66 29Z" },
    { tone: "hollow", d: "M40 44H46V48H40Z" },
    { tone: "hollow", d: "M54 44H60V48H54Z" },
    // Braided beard
    { tone: "accent", d: "M33 50C35 66 42 80 50 86C58 80 65 66 67 50C60 57 40 57 33 50Z" },
    // Barbell across the chest
    { tone: "primary", d: "M2 88H98V93H2Z" },
    { tone: "primary", d: "M6 78H13V103H6Z" },
    { tone: "primary", d: "M87 78H94V103H87Z" },
  ],
};

const ELF_RANGER: AvatarArt = {
  id: "elf-ranger",
  accent: "green",
  shapes: [
    // Cloak and the bow over one shoulder
    { tone: "accent", d: "M12 100C16 74 32 66 50 66C68 66 84 74 88 100Z" },
    { tone: "muted", d: "M72 58C90 68 92 92 80 102L75 102C85 92 84 72 68 62Z" },
    // Pointed ears, face, swept hair and eyes
    { tone: "secondary", d: "M35 44L15 28L32 56Z" },
    { tone: "secondary", d: "M65 44L85 28L68 56Z" },
    { tone: "secondary", d: "M50 28C40 28 34 36 34 46C34 58 41 64 50 66C59 64 66 58 66 46C66 36 60 28 50 28Z" },
    { tone: "primary", d: "M32 46C30 30 38 20 50 20C62 20 70 30 68 46C64 36 56 32 50 32C44 32 36 36 32 46Z" },
    { tone: "hollow", d: "M40 46H46V49H40Z" },
    { tone: "hollow", d: "M54 46H60V49H54Z" },
    // Leaf brooch
    { tone: "primary", d: "M50 72C56 74 58 80 50 87C42 80 44 74 50 72Z" },
  ],
};

// Keyed by catalog id, in catalog order: `manifest.json` lists exactly these keys.
export const AVATAR_ART: Readonly<Record<string, AvatarArt>> = {
  [NOVICE.id]: NOVICE,
  [DWARF_LIFTER.id]: DWARF_LIFTER,
  [ELF_RANGER.id]: ELF_RANGER,
};

// The Avatar the header shows for the stored id. The API already reads unknown ids as the
// Novice; this falls back too, so a shell rendered against an older or newer catalog, or with
// no Interface Preference at all, still draws a figure rather than nothing.
export function headerAvatar(avatarId: string | undefined): AvatarArt {
  if (avatarId !== undefined && Object.hasOwn(AVATAR_ART, avatarId)) {
    return AVATAR_ART[avatarId];
  }
  return AVATAR_ART[DEFAULT_AVATAR_ID];
}
