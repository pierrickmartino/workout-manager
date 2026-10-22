# Avatar portraits

The AI-generated portraits every Avatar is drawn with (ADR-0137): one per catalog Avatar in
each Avatar Universe. The admin publishes which universe the app shows, from the admin page.

## Layout

`<universe>/<catalog id>.webp`. The ids are the catalog's in `apps/api/app/domain/avatars.py`,
and both lists are mirrored in `lib/avatar/manifest.json`. Every universe uses the same eight
file names; the character each file shows (named by the backend) is:

| Catalog id (file) | `realm/` (default) | `orbit/` | `olympus/` |
| ----------------- | ------------------ | ------------ | -------------- |
| `novice`          | Novice             | Cadet        | Initiate       |
| `dwarf-lifter`    | Dwarf Lifter       | Rig Hauler   | Forgehand      |
| `elf-ranger`      | Elf Ranger         | Pathfinder   | Huntress       |
| `monk`            | Monk               | Zero-G Adept | Sage           |
| `barbarian`       | Barbarian          | Void Raider  | Lion-Bearer    |
| `valkyrie`        | Valkyrie           | Drop Trooper | Amazon         |
| `paladin`         | Paladin            | Sentinel     | Hoplite        |
| `titan`           | Titan              | Colossus     | Atlas          |

`lib/avatar/avatar-art.test.ts` fails if any of these files is missing.

## Adding or replacing a portrait

Generate a square image with the face centred and the eyes a little above the middle: it is
cropped to a circle and shown from 28px (the header) to 72px (Profile). Downscale it to a
512×512 WebP at quality 85 (about 40–80 KB) rather than committing the generator's original
PNG (about 2.5 MB):

```python
from PIL import Image
Image.open("source.png").convert("RGB").resize((512, 512), Image.LANCZOS).save(
    "orbit/monk.webp", "WEBP", quality=85, method=6
)
```

A new universe also needs a name for every id in `AVATAR_NAMES` on the backend and its id in
both `AVATAR_UNIVERSES` lists and the manifest; the contract tests fail until all agree.
