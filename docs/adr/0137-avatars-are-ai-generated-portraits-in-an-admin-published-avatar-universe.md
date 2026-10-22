---
status: accepted
---

# 0137 — Avatars are AI-generated portraits in an admin-published Avatar Universe

ADR-0136 drew each Avatar as a local SVG from Skin tokens and ruled out raster art and
AI-generated art. Users wanted more realistic characters. A prototype compared hand-drawn SVG
portraits with AI-generated images, cast in three universes, and the owner chose the images and
kept all three universes. The prototype stays on branch `claude/dreamy-archimedes-h43euq` at
commit `6b43cf5` as the record of what was tried.

## Decision

**An Avatar is drawn as an AI-generated portrait, in the one Avatar Universe the admin has
published.**

- **AI-generated raster art is allowed for Avatars.** Each portrait is a 512×512 WebP, generated
  outside the app, downscaled and committed under `apps/web/public/avatars/<universe>/<id>.webp`.
  It is served from the app's own origin, so there is no new network origin. This replaces
  ADR-0136's "Artwork is local SVG" bullet and its "never AI-authored" art rule. The catalog
  itself (ids, unlock levels, names) is still curated by hand.
- **Three Avatar Universes: The Realm, Orbit and Olympus.** Each draws the same eight catalog
  Avatars, with the same ids and unlock levels, as a different character with its own name. The
  Realm keeps today's fantasy names and is the default.
- **The admin publishes one universe for everyone**, like the Active Skin (ADR-0048): a single
  `app_setting` row, readable by any user, published only by an admin, served through a short-TTL
  cache, read by the root layout each render. An absent or unknown value reads as The Realm, so
  no seed migration is needed.
- **Switching universe never changes anyone's choice.** A user stores the Avatar's id, so their
  Monk becomes the Zero-G Adept in Orbit and the Sage in Olympus. Unlocks are unchanged.
- **The backend names, the web app draws.** `GET /api/avatars` returns the published universe and
  each character's name in it; the web app draws the portraits from that same universe so a name
  and its picture always agree. A contract test holds the web manifest's ids and universes to the
  backend's, and a web test checks every portrait file exists.

## Considered options

- **Let each user pick a universe.** Rejected for now: it adds a stored Interface Preference and a
  second choice to the picker, and the owner wanted one cast across the app at a time.
- **Keep the drawn SVG portraits.** Rejected: even with painterly shading they read as game art,
  not as the realistic characters asked for.

## Consequences

- The portraits are fixed images: unlike the old art they do not recolour with the Skin or Mode.
  Only the ring around each portrait still uses the Avatar's accent token.
- A locked Avatar is drawn as a greyed, darkened portrait rather than a one-tone silhouette.
- The root layout makes one more cached read per render (the universe), in parallel with the
  Active Skin and Interface Preference reads.
- Adding a universe needs a name for every catalog id on the backend and a portrait for every id
  on the web; the tests fail until both exist.
