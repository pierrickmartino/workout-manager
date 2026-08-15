# 0047 — A user's Theme is an Appearance Preference, stored apart from the Fitness Profile

Users can now choose a **Mode** (Light / Dark / System), synced to their account so it
follows them across devices. We store that per-user choice as a new **Appearance
Preference** concept rather than as a column on the **Fitness Profile**, because the
Fitness Profile is defined strictly as *what the AI conditions a generation on* (and what
normalises into the generation cache key). A visual Mode steers nothing about a plan, so
folding it into the Profile would erode that meaning and risk an appearance field leaking
into generation or the cache key. The Appearance Preference is read-time UI state only; it
never reaches the generator.

## Considered options

- **Add `theme_mode` to the Fitness Profile (rejected).** Fewest tables, but couples
  appearance to generation input and muddies the cache-key normalisation the Profile
  feeds.
- **A separate Appearance Preference concept (chosen).** One more small per-user record
  behind its own repository and endpoint, keeping generation input pure.

## Consequences

- Appearance is server-synced (identical on every device) but travels through its own
  repository/endpoint, never the Profile's.
- A user with no Appearance Preference yet defaults to **Dark** Mode, preserving today's
  all-dark experience (existing users are never silently light-flipped on deploy).
- The final Theme a user sees is always **Active Skin × Mode** (see ADR-0048); the
  Appearance Preference owns only the Mode half.
