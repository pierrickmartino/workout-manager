# 02 — Edit an Exercise's descriptive fields

**What to build:** From a browser row, an admin opens an editor for one Catalog Exercise
and corrects its descriptive content — description, **Execution Steps**, targeted muscles,
required equipment, difficulty, and the **Primary/Secondary** muscle-emphasis split — and
its display name. Edits are partial (only changed fields are sent). A rename whose
normalized name would collide with a *different* Exercise is rejected with a clear conflict
so two distinct movements are never silently merged; a spelling/casing fix that doesn't
change the normalized identity is accepted.

**Blocked by:** 01 — Admin catalog browser.

**Status:** ready-for-agent

- [ ] An admin-gated partial-edit endpoint updates the descriptive fields and the emphasis split, returning the updated Exercise via the envelope.
- [ ] The repository writer is immutable (returns a fresh Exercise; no in-place mutation).
- [ ] A rename that collides with another Exercise's normalized name returns 409 and changes nothing; a same-identity rename succeeds.
- [ ] Invalid input is rejected with 422; a missing Exercise returns 404; non-admins are rejected.
- [ ] An `/admin/exercises/[id]` editor page lets the admin change these fields and shows the collision error.
- [ ] Provenance is unchanged by this edit (it is a separate deliberate act — see ticket 03).
- [ ] Editor form/mapping logic that belongs in `lib/` has co-located tests; the component stays thin.
