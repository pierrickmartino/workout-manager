# 0029 — Read-time projections share one Logged-Set flattening, guarded by a tripwire

Every read-time projection of the *record* side — Personal Records, the Analytics feed,
the Exercise Detail header, the strength timeline, and the **Achievement** wall — starts
by flattening Logged Sessions into a stream of dated `LoggedSetRecord`s. That flattening
now lives in **exactly one place**, `app/domain/personal_records.logged_set_records`, and
a hand-rolled `LoggedSetRecord(...)` anywhere else in the production tree is a **guard
failure**, not a review note.

**The divergence this fixes was live and user-visible.** `app/logbook/records.set_records`
carried `body_weight_kg` (the Performed Body Weight, ADR-0026); `domain/achievements.py`
re-inlined the same comprehension and did not. One bodyweight set — a 5-rep pull-up with a
75 kg Performed Body Weight — therefore produced a Personal Record on Home, Analytics and
Exercise Detail (Estimated 1RM 87.5, `is_bodyweight=True`) while the **First Record**
milestone stayed locked at 0/1. `detect_personal_records`, `estimated_1rm_for_set` and
`resolve_bodyweight_kg` were each individually correct and individually tested; the defect
lived entirely in *which* flattening the call site picked. A calisthenics user got a
strength wall the type-neutral catalog (ADR-0018/0019) exists to prevent.

**The copy was structural, not lazy — so the fix is placement, not diligence.**
`domain/achievements.py` is a pure domain module ("no ORM, no HTTP"); `set_records` lived
in `app/logbook/` and took `list[LoggedSessionView]`, a type owned by
`app/repositories/`. A domain module could not call it without inverting the layering
CLAUDE.md sets out. The seam was on the wrong side of the line, so the second flattening
was the only way for a domain metric to reach the stream. Moving the flattening **down**
into `domain/personal_records.py` — next to the `LoggedSetRecord` it produces, typed over
structural `LoggedSession` / `LoggedSet` Protocols rather than the repository view — lets
both consumers point downward at one implementation. `logbook/records.set_records` is
deleted rather than kept as a forwarding shim: with the flattening one import away, it
hid nothing.

**The omission was in the interface, not the comprehension.** `achievements.py`'s private
`_LoggedSet` Protocol enumerated five fields and `body_weight_kg` was not among them, so
the structural type *could not see* the field the repository view had carried since
ADR-0026. Fixing only the comprehension would have left the shape that permitted it. The
shared Protocol therefore declares `body_weight_kg`, and the catalog's own Protocol
composes from it to add `targeted_muscles` for the Muscle-Group metric.

**Enforcement is a runtime tripwire because the type system is not running.** CI runs
pytest, `node --test` and an advisory Lighthouse audit; no mypy, no pyright, and
`pyproject.toml` configures neither. Python's structural typing is checked by a type
checker or not at all, so a widened Protocol *documents* the contract and **enforces
nothing** — a future consumer can declare its own narrower Protocol and re-inline the
comprehension, which is precisely how this bug arose. Two mechanisms that do run therefore
carry it:

- **A cross-surface agreement test.** One bodyweight history; the set that surfaces as a
  Personal Record must be the set that unlocks `first-pr`. This asserts the *invariant*
  ("a PR means the same thing everywhere") rather than either implementation, so it
  survives any future re-shaping of the read models.
- **A `terminology_guard` entry** banning `LoggedSetRecord(` outside the flattening. The
  guard gains a per-term `allowed_paths` so one term can be exempted in one file without
  disabling the whole registry there (`EXCLUDED_PATHS` is global and stays that way).

**This stretches the guard's charter, deliberately.** The registry was built for retired
*terminology*; this entry guards a *construction site*. It fits the charter as written —
"a term whose very shape encodes a rejected design, whose reappearance as an identifier is
a bug" — because a hand-rolled `LoggedSetRecord` **is** the rejected design: it is the
literal shape that drops Performed Body Weight. A future reader finding a non-terminology
entry in that file should read it as the guard doing its stated job, not as scope creep.
Test files are unaffected: the guard scans `apps/api/app` and the web source roots, never
`tests/`, so the detector's unit tests keep hand-building `LoggedSetRecord`s — which is
correct, since that is the surface they exist to test.

## Considered options

- **Widen the Protocol and fix the call site, nothing more** — rejected as insufficient,
  not wrong. It is the right change to the code, but with no type checker in CI it leaves
  the recurrence unguarded, and recurrence is what turned a correct detector into a wrong
  badge.
- **Keep `set_records` as a typed narrowing over `LoggedSessionView`** — rejected: it
  becomes a one-line forward with four callers, the exact shallow module whose interface
  is as complex as its implementation. With no type checker, pinning the concrete type
  buys documentation only.
- **Inject the flattened stream into `evaluate_achievements`** — rejected: the catalog's
  uniform `metric: Sequence[_LoggedSession] -> int` signature is what makes `unlocked_on`
  recoverable by replay. A metric taking a pre-flattened stream forces `_Definition` to
  carry two metric kinds and `_unlocked_on` to advance a session prefix and a set prefix
  in lockstep — real complexity added to the honest-unlock-date machinery to avoid one
  import.
- **Move the PR metric up into `app/logbook/`** — rejected: it splits the curated catalog
  across two packages and weakens the "the catalog is one fixed, type-neutral thing" story
  that ADR-0019 rests on.
- **Adopt mypy in CI so the Protocol becomes load-bearing** — deferred, not rejected. It
  is the stronger enforcement and would pay back across the whole codebase, but it is a
  separate change with a baseline-error cost across 100+ modules, and it must not be a
  prerequisite for closing a live divergence. If it lands later, the guard entry becomes
  belt-and-braces rather than the only line of defence.

## Consequences

- **Existing bodyweight-only users see First Record flip to unlocked** on their next read,
  with a back-dated `unlocked_on`. `_has_personal_record` is monotonic over a chronological
  prefix, so the replay recovers an honest date. This is ADR-0018's intended
  non-monotonicity running forward instead of backward — no migration, no backfill.
- `CONTEXT.md` §Achievement now states the general rule the specific bug broke: a milestone
  that names another term reads **that term's own definition**, never a private variant.
- Adding a field to `LoggedSetRecord` is now a one-site edit that every projection picks up,
  instead of a two-site edit where missing one is silent.
- The guard's `BannedTerm` gains `allowed_paths`; existing entries are unchanged and keep
  scanning every non-excluded file.
