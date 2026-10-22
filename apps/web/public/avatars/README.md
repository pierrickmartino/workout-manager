# Avatar portraits (PROTOTYPE)

Raster portraits for the realistic-Avatar prototype on `/profile/avatar`. Not for main:
ADR-0136 and the glossary say an Avatar is never AI-generated and never a raster asset, so
these stay on the prototype branch until a new ADR decides otherwise.

## Layout

`<universe>/<catalog id>.webp`, where the catalog id is the one in
`apps/api/app/domain/avatars.py` (and `lib/avatar/manifest.json`):

| Catalog id     | `realm/` (A)  | `orbit/` (B)  | `olympus/` (C) |
| -------------- | ------------- | ------------- | -------------- |
| `novice`       | Novice ✅      | Cadet ✅ (`cadet.webp`) | Initiate ✅ (`initiate.webp`) |
| `dwarf-lifter` | Dwarf Lifter ✅ | Rig Hauler ✅ (`rig-hauler.webp`) | Forgehand ✅ (`forgehand.webp`) |
| `elf-ranger`   | Elf Ranger ✅  | Pathfinder    | Huntress ✅ (`huntress.webp`) |
| `monk`         | Monk ✅        | Zero-G Adept  | Sage ✅ (`sage.webp`) |
| `barbarian`    | Barbarian ✅   | Void Raider   | Lion-Bearer ✅ (`lion-bearer.webp`) |
| `valkyrie`     | Valkyrie ✅    | Drop Trooper  | Amazon ✅ (`amazon.webp`) |
| `paladin`      | Paladin ✅     | Sentinel      | Hoplite ✅ (`hoplite.webp`) |
| `titan`        | Titan ✅       | Colossus      | Atlas ✅ (`atlas.webp`) |

## Format

512×512 WebP, quality 85 (about 40 KB each). The largest on-screen size is a 120px portrait,
so 512px covers 3× screens with room to spare. Downscale the generator's output rather than
committing the original PNG (about 2.4 MB each).
