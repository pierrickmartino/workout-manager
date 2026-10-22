# Avatar portraits (PROTOTYPE)

Raster portraits for the realistic-Avatar prototype on `/profile/avatar`. Not for main:
ADR-0136 and the glossary say an Avatar is never AI-generated and never a raster asset, so
these stay on the prototype branch until a new ADR decides otherwise.

## Layout

`<universe>/<catalog id>.webp`, where the catalog id is the one in
`apps/api/app/domain/avatars.py` (and `lib/avatar/manifest.json`). Every universe uses the
same eight file names, so the picker finds a portrait from the universe and the id alone;
the table gives the character each file shows:

| Catalog id (file) | `realm/` (A) | `orbit/` (B) | `olympus/` (C) |
| ----------------- | ------------ | ------------ | -------------- |
| `novice`          | Novice       | Cadet        | Initiate       |
| `dwarf-lifter`    | Dwarf Lifter | Rig Hauler   | Forgehand      |
| `elf-ranger`      | Elf Ranger   | Pathfinder   | Huntress       |
| `monk`            | Monk         | Zero-G Adept | Sage           |
| `barbarian`       | Barbarian    | Void Raider  | Lion-Bearer    |
| `valkyrie`        | Valkyrie     | Drop Trooper | Amazon         |
| `paladin`         | Paladin      | Sentinel     | Hoplite        |
| `titan`           | Titan        | Colossus     | Atlas          |

All 24 are in place. The picker renders them in
`app/profile/avatar/prototype-avatar-universes.tsx`; `?art=svg` swaps back to the drawn
portraits for comparison.

## Format

512×512 WebP, quality 85 (about 40 KB each). The largest on-screen size is a 120px portrait,
so 512px covers 3× screens with room to spare. Downscale the generator's output rather than
committing the original PNG (about 2.4 MB each).
