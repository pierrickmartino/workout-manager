# 0048 — Skins are a fixed catalog; the Active Skin is a global setting an admin publishes

We're adding **Skins** — named palette families, each with a light and a dark variant — as
a **fixed, code-defined catalog**. Which Skin is live app-wide (the **Active Skin**) is a
single global value that an **admin** changes at runtime by **publishing**: they preview a
Skin privately, then commit it as the Active Skin for every user. This introduces the
codebase's first piece of **global, mutable app state** and its first **admin write
endpoint** — ADR-0046 added only an admin *trigger*. Admin is gated by the **existing
`role=admin` Clerk claim** from ADR-0046, reused rather than reinvented.

## Considered options

- **Skin as an env/config value (rejected).** Changing the look would need a redeploy,
  defeating runtime admin control.
- **Admin-authored palettes (rejected for v1).** Arbitrary token storage plus
  contrast/accessibility validation and the risk of publishing a broken palette live to
  everyone; deferred in favour of a curated catalog.
- **A global single-row app-setting, admin-published, read per render with a short cache
  (chosen).** The only option that lets an admin switch at runtime without a redeploy.

## Consequences

- The final **Theme** is always **Active Skin × per-user Mode** (ADR-0047), so **every
  Skin must ship both a light and a dark variant**. The current PULSE dark look becomes
  the PULSE Skin's *dark* variant, and a *light* variant is authored alongside it.
- Publishing restyles the app for all users on their **next navigation**, not live — no
  websocket/push layer is added; a brief server-side cache bounds the propagation delay.
- Because the read sits on every render, the Active Skin is cached rather than hit on each
  page load; publishing invalidates or ages out that cache.
- **Naming discipline:** the person who publishes a Skin is the **admin**, never the
  "Operator" — "Operator Level" is the gamification XP tier and must not be overloaded.
