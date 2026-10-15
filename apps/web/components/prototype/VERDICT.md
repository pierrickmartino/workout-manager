# Prototype verdict — unified Session card

**Question:** what should one Session card look like on both Train ("Pick up again") and My Sessions?

**Answer (2026-10-15): variant A, as adjusted in commit 4b71c2f.**

- Whole card taps into the Session detail; Start stays beside the title (alone).
- "Last trained …" / "Not trained yet" on its own row, then the first ≤3 exercises.
- Bottom row, no divider above it: "N exercises" · "Trained N×" · ⋯ (Favorite).

**To fold in on main:** `GET /api/sessions` must carry the last performed date and the exercise
preview — the prototype fakes them with a full History read plus one detail read per Session (N+1).
B (dense row), C (stat tile) and the switcher stay here, on this branch only.
