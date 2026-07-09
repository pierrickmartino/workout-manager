---
status: proposed
---

# 0021 — F4 reinterprets Pulse's Protocol Builder onto the honest model

The Pulse design draws the Builder as an **M–S weekday matrix** authoring a weekly
template, with a **`MODE · HYPER`** knob, a **`SIMULATE`** action, an editable
**"PROTOCOL ID"** name, and an Exercise Library of "420 movements". As with every prior
screen (ADR-0008 Home, ADR-0011 Analytics, ADR-0017 Exercise Detail, ADR-0019 Profile),
F4 is **reinterpreted onto what the model can honestly back** rather than ported
literally. ADR-0020 covers the mutation *engine*; this ADR records the screen-level
*scope* decisions — several of them deliberate **no-s** a future reader would otherwise
assume were oversights.

**The week matrix is positional, not a M–S weekday grid.** The plan model is self-paced
and calendar-free (ADR-0001), and Home already reinterprets Pulse's calendar the same
way (ADR-0009). The builder's matrix is therefore **Week × session-slot** (rows =
weeks, columns = the 1..N sessions in that week, cell = Prescription count) with no
weekday binding or dates. Consistent with ADR-0020, it renders the *actual* per-week
count rather than assuming a fixed frequency.

**`MODE` (`HYPER`) is dropped.** There is no `mode` field, and none is added:
`objective` and `training_type` already carry training intent, so a "HYPER" knob would
be a fabricated control with nothing behind it — the class of thing prior Fs refused.

**`SIMULATE` is reinterpreted as a non-predictive balance preview.** A builder-app
"simulate" usually projects fatigue / volume / 1RM over the cycle; this domain has **no
fatigue model, no recovery clock, and no headline volume figure** (calendar-free,
coverage-dependent) — the same "no honest basis" that dropped the target-calorie and
numeric readiness % (ADR-0008), the 1Y range (ADR-0011), and total-hours (ADR-0019). So
`SIMULATE` shows only what the plan you built actually *is*: per-week session/set counts
and the **Muscle-Group distribution across the whole edited Protocol**, computed from
the existing curated roll-up (`domain/muscle_groups.py`, ADR-0011). No prediction —
just "this plan is 60% Legs, 5% Back" before you commit.

**The Exercise Library is pick-only over the shared catalog; there is no manual
free-create.** The catalog is global, deduped, and enriched (ADR-0002), and in practice
every row is `ai_generated` — so the library exposes the **whole catalog** with each
row's `provenance` surfaced exactly as the Session view and Exercise Detail already do
(a curated-only library would be empty). Letting the builder insert a raw, name-only
Exercise would pollute the shared catalog for **every** user with an unenriched movement
(no muscles, no execution steps, no difficulty). A wanted-but-absent movement is a
**generation** concern, not a manual insert — a documented v1 limitation, not a faked
seam. This needs a net-new `GET /api/exercises?query=` (the catalog had only
`get`-by-id before).

**Smaller scope calls.** The Protocol gains a nullable **`name`** (Pulse's "PROTOCOL
ID"), with a derived `objective · training_type` label as the fallback so existing
adopted Protocols read fine unbackfilled. The **editable config is deliberately narrowed
to `name` + frequency + weeks**; `objective` / `training_type` / `duration_minutes` are
shown but not editable in v1 — they are generation/cache provenance and editing them
raises cascade-to-Sessions ambiguity with no real payoff. Prescriptions can be added,
removed, edited, **and reordered** within an un-performed Session (`position` is just a
field). Load entry **reuses the log form's kind-picker** (`load_from_input`) so building
a Prescription and logging a set speak one Load language.

**F6's `ADD TO PROTOCOL` is unblocked.** The disabled seam ADR-0017 left in place now
**deep-links into the builder** with that Exercise queued for placement into an
un-performed Session (a staged edit, deployed like any other, per ADR-0020). It targets
the user's Current Protocol; when there is no Protocol or no un-performed Session it
stays the **honest disabled seam**, never a faked write.

## Consequences

- The Builder matches Pulse's *look* but diverges from its *semantics* (positional not
  weekday, no mode, non-predictive simulate, pick-only library); these divergences are
  deliberate and should not be "fixed" back toward the mock.
- The **no-manual-Exercise-create** boundary is a scope decision (ADR-0002) a future
  reader will question — recorded here so it survives.
- Net-new surface: a `GET /api/exercises` search endpoint and a Protocol `name` column;
  the Builder otherwise composes over data and engines that already exist.
