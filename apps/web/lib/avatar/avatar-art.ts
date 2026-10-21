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
export type AvatarAccent = "cyan" | "blue" | "violet" | "magenta" | "amber" | "green";

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

const MONK: AvatarArt = {
  id: "monk",
  accent: "violet",
  shapes: [
    // Robe and the sash across it
    { tone: "muted", d: "M14 100C18 74 34 64 50 64C66 64 82 74 86 100Z" },
    { tone: "accent", d: "M30 72L72 100L60 100L26 78Z" },
    // Shaved head, the mark on the brow and eyes closed in focus
    { tone: "secondary", d: "M50 22C39 22 32 31 32 43C32 55 40 62 50 62C60 62 68 55 68 43C68 31 61 22 50 22Z" },
    { tone: "accent", d: "M48 29H52V35H48Z" },
    { tone: "hollow", d: "M39 44H47V46H39Z" },
    { tone: "hollow", d: "M53 44H61V46H53Z" },
    // Prayer beads at the neck
    { tone: "primary", d: "M34 64C40 72 60 72 66 64L66 68C60 76 40 76 34 68Z" },
  ],
};

const BARBARIAN: AvatarArt = {
  id: "barbarian",
  accent: "magenta",
  shapes: [
    // Broad shoulders under a fur collar
    { tone: "muted", d: "M8 100C10 76 28 66 50 66C72 66 90 76 92 100Z" },
    {
      tone: "primary",
      d: "M18 80C22 70 34 64 50 64C66 64 78 70 82 80C74 76 66 78 58 74C54 78 46 78 42 74C34 78 26 76 18 80Z",
    },
    // Face, wild mane, eyes and war paint
    { tone: "secondary", d: "M50 26C39 26 33 34 33 45C33 56 40 63 50 63C60 63 67 56 67 45C67 34 61 26 50 26Z" },
    { tone: "primary", d: "M28 48C22 34 30 16 50 14C70 16 78 34 72 48C70 38 64 30 50 30C36 30 30 38 28 48Z" },
    { tone: "hollow", d: "M40 43H46V47H40Z" },
    { tone: "hollow", d: "M54 43H60V47H54Z" },
    { tone: "accent", d: "M35 50L45 52V55L35 53Z" },
    { tone: "accent", d: "M65 50L55 52V55L65 53Z" },
    // Axe raised at the shoulder
    { tone: "primary", d: "M84 38H88V100H84Z" },
    { tone: "accent", d: "M86 36C97 38 99 54 93 64L86 58Z" },
  ],
};

const VALKYRIE: AvatarArt = {
  id: "valkyrie",
  accent: "blue",
  shapes: [
    // Armoured shoulders and breastplate
    { tone: "muted", d: "M12 100C16 74 32 66 50 66C68 66 84 74 88 100Z" },
    { tone: "accent", d: "M38 72H62L58 92H42Z" },
    // Braids, face, winged helmet and eyes
    { tone: "primary", d: "M30 44C28 60 30 74 34 84L40 84C36 72 36 58 36 46Z" },
    { tone: "primary", d: "M70 44C72 60 70 74 66 84L60 84C64 72 64 58 64 46Z" },
    { tone: "secondary", d: "M50 30C40 30 35 38 35 47C35 58 42 64 50 64C58 64 65 58 65 47C65 38 60 30 50 30Z" },
    { tone: "primary", d: "M33 42C33 28 41 20 50 20C59 20 67 28 67 42Z" },
    { tone: "accent", d: "M34 34C25 32 17 24 14 12C22 18 28 22 36 26Z" },
    { tone: "accent", d: "M66 34C75 32 83 24 86 12C78 18 72 22 64 26Z" },
    { tone: "hollow", d: "M41 47H47V50H41Z" },
    { tone: "hollow", d: "M53 47H59V50H53Z" },
    // Spear
    { tone: "primary", d: "M8 30H11V100H8Z" },
    { tone: "accent", d: "M9.5 14L14 30H5Z" },
  ],
};

const PALADIN: AvatarArt = {
  id: "paladin",
  accent: "amber",
  shapes: [
    // Plated shoulders
    { tone: "muted", d: "M8 100C10 76 28 66 50 66C72 66 90 76 92 100Z" },
    // Crested great helm and its visor slit
    { tone: "accent", d: "M47 6H53V22H47Z" },
    { tone: "primary", d: "M50 16C36 16 30 28 30 44C30 56 36 64 50 64C64 64 70 56 70 44C70 28 64 16 50 16Z" },
    { tone: "hollow", d: "M36 40H64V46H36Z" },
    // Shield and the cross on it
    { tone: "secondary", d: "M56 70H90V84C90 94 80 100 73 102C66 100 56 94 56 84Z" },
    { tone: "accent", d: "M70 74H76V96H70Z" },
    { tone: "accent", d: "M62 80H84V86H62Z" },
  ],
};

const TITAN: AvatarArt = {
  id: "titan",
  accent: "cyan",
  shapes: [
    // Shoulders as wide as a mountain
    { tone: "muted", d: "M2 100C2 70 24 58 50 58C76 58 98 70 98 100Z" },
    // Hewn head, its stone crown, the shadowed brow and the eyes burning under it
    { tone: "secondary", d: "M34 24H66L70 58H30Z" },
    { tone: "primary", d: "M32 28L36 12L44 22L50 8L56 22L64 12L68 28Z" },
    { tone: "hollow", d: "M36 34H64V46H36Z" },
    { tone: "accent", d: "M40 38H47V42H40Z" },
    { tone: "accent", d: "M53 38H60V42H53Z" },
    // Rune on the chest
    { tone: "accent", d: "M44 70H56L50 84Z" },
  ],
};

// Keyed by catalog id, in catalog order: `manifest.json` lists exactly these keys.
export const AVATAR_ART: Readonly<Record<string, AvatarArt>> = {
  [NOVICE.id]: NOVICE,
  [DWARF_LIFTER.id]: DWARF_LIFTER,
  [ELF_RANGER.id]: ELF_RANGER,
  [MONK.id]: MONK,
  [BARBARIAN.id]: BARBARIAN,
  [VALKYRIE.id]: VALKYRIE,
  [PALADIN.id]: PALADIN,
  [TITAN.id]: TITAN,
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
