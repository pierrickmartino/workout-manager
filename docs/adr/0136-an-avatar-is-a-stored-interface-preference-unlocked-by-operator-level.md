---
status: accepted
---

# 0136 — An Avatar is a stored Interface Preference unlocked by Operator Level

**Amended by [ADR-0137](./0137-avatars-are-ai-generated-portraits-in-an-admin-published-avatar-universe.md):**
Avatars are now AI-generated portraits, drawn in the Avatar Universe the admin publishes. The
"Artwork is local SVG" bullet and the "never AI-authored" art rule below no longer hold; the
stored choice, the curated catalog and the unlock rules still stand.

The header showed a plain "Account" button to every signed-in user. Users want an identity
of their own there: a fantasy workout character they choose, with more characters opening up
as they log work (#745).

## Decision

**An Avatar is a stored user choice. Whether an Avatar can be chosen is computed from the
Operator Level.**

- **Stored on the Interface Preference.** The chosen Avatar is a new facet of the
  Interface Preference (ADR-0047, ADR-0055): a deliberate user choice, the same kind of thing
  as Mode or a Favorite. It is never on the Fitness Profile, so it never reaches generation or
  its cache key, and the safety cache bypass (ADR-0003) is untouched. No stored value means
  the default **Novice**, so existing users see no change when this ships.
- **A curated, fixed catalog.** Avatars come from a curated catalog in the API's domain layer,
  never user- or AI-authored. Each entry has an id, a name and an unlock level. Each character
  is loosely themed on a Training Type, but the theme has no behaviour.
- **Unlocks are computed, never stored.** An Avatar is unlocked when the user's current
  Operator Level reaches its unlock level. It is worked out from the record each time, like
  every other gamification projection (ADR-0018, ADR-0019). There is no unlock table, no
  unlocked-avatars column and no write hook. Three Avatars, Novice included, are free.
- **Operator Level only.** Unlocks never depend on a Training Type or a type-specific
  Achievement. Any user, whatever they train, can reach every Avatar, consistent with the
  Training-Type-neutral Achievement catalog.
- **Checked on selection only.** Saving an Avatar is refused when it is locked at that
  moment. Operator Level can fall when logs are corrected or deleted. When it does, an Avatar
  already chosen stays: taking it away would punish honest record-keeping. The picker shows
  the Avatar as locked again for anyone choosing it fresh.
- **Tolerant read, strict write.** An unknown stored id, such as one retired from the
  catalog, reads as the Novice. Only a valid, unlocked id can be written.
- **Artwork is local SVG.** Each Avatar is drawn as a local SVG coloured from Skin tokens, so
  it renders in every Skin and Mode under the Contrast Floor. There is no raster asset, no
  AI-generated art and no new network origin. This follows the Workout Signature's example.
- **The header Avatar still links to Profile.** It replaces the "Account" button but keeps
  "Account" as the link's accessible name. Sign-out stays on Profile, so it still runs the
  account-scoped teardown (ADR-0059, ADR-0080).

## Consequences

- The per-page Interface Preference read returns the Avatar without computing XP. Only the
  picker and the save path compute the Operator Level.
- Saving an Avatar reads the user's Logged Sessions. Saving another Interface Preference
  facet does not.
- The backend owns the catalog and the web app owns the artwork, so a contract test checks
  their id lists match.
- Not in this decision: showing an Avatar to other people (shared links, the Training
  Passport), unlock notifications, and choosing one during onboarding.
