# 0064 — Progression becomes a selectable scheme registry (and Pin is retired)

Progression was one hard-coded rule: a fixed-increment double-progression that reads
the user's Logged Sets and steps a Prescription's load or bodyweight reps (ADR-0004,
ADR-0026). openGym-style apps let a user pick a named progression *system* per
movement, and users asked for the same. We make Progression **selectable**: a
**Progression Scheme** is a named member of a *curated, closed* set of deterministic
stepping strategies — the same species as Training Type, Muscle Group, and the Skin
catalog — and a Prescription may carry a user-chosen scheme, defaulting to the
existing engine. The surprising, load-bearing part worth recording is *how* we kept
this inside the domain's hardest invariants: it stays a **read-time projection of the
record**, it never introduces a calendar, and it never auto-swaps a movement.

## What a scheme is

A scheme is a pure function `(Prescription, Logged Sets) → next Prescription` — exactly
the shape `next_prescription` already has. The catalog is **curated and fixed**, never
user- or AI-authored (an unvalidated stepping rule is a safety risk in an
injury/rehab-cautious domain, the same reasoning that keeps the Skin, Muscle Group, and
Achievement catalogs closed). The existing engine becomes the **default scheme, Double
Progression** — named, not rewritten.

**v1 catalog:**

- **Double Progression** *(default)* — every set at the rep ceiling *at low perceived
  effort* steps the load (absolute kg / bodyweight added-kg) or, pure-bodyweight, the
  rep target; a miss backs the load off by the cautious `DECREASE_KG`.
- **Greyskull-style Linear** — bounded to absolute + bodyweight-added loads. Per-session
  `+INCREASE_KG` on hitting the rep floor (AMRAP-aware final set), and — the trait that
  earns it a place beside Double Progression — a **reset-on-failure**: missing the floor
  deloads by a fixed fraction (`RESET_FRACTION`, ~0.9 / −10%) rather than the cautious
  fixed `−DECREASE_KG` hold.
- **Session-Count-Based** — the honest reinterpretation of "time-based" (see below).
  Counts a movement's **performed exposures** and steps **unconditionally every N-th**
  (default 3), on the same axis Double Progression uses; no rep/effort gate, no reset.
- **Static / Manual** — never auto-steps; holds the plan's authored values (later-week
  deloads survive intact). The user drives the numbers by hand.

## Load-bearing decisions

**"Time-based" is reinterpreted as session-count-based, never a clock.** A literal
time-based scheme ("+2.5 kg every week") needs a training-week calendar and a "today" —
exactly what ADR-0001 (self-paced, calendar-free) forbids. The only "week" in this
domain is a read-time bucket over Logged Session *dates* (Streak, Weekly Distance); the
plan has no clock. A literal clock would also jump a user's load three steps after a
three-week layoff *without training* — the "recovery %/today" anti-pattern the domain
rejects. So we count **performed exposures of the movement**, the same record-derived,
calendar-free move Streak (ADR-0001) and Home (ADR-0008) already make.

**The selection is stored; the computation stays read-time.** A Prescription gains a
nullable, per-Prescription **scheme selection** — a user *choice*, the same species as
Favorite and the retired Pin, which ADR-0018 explicitly permits (that rule bans stored
*derived* ledgers, not user choices). The read-time overlay *dispatches* on the
selection; the step itself is still computed from the record on every read and stores
nothing. Switching or clearing a scheme is therefore a clean, non-destructive restore —
it mutates neither the cached Generated artifact nor any performed record.

**Global default + per-Prescription override, uniform everywhere.** Every Prescription
inherits one system-wide default (Double Progression — today's exact behavior, so
nothing regresses) and a user may override a single movement. No per-Protocol tier
(YAGNI). The selection applies to **any** Prescription, Protocol-member or standalone.

**Two registry-wide invariants, not per-scheme choices:**

- **Never auto-swap.** No scheme swaps a movement; any scheme that drives a
  pure-bodyweight rep target to its ceiling raises the harder-Variation *offer*
  (`suggest_harder_variation`) rather than growing reps unbounded (ADR-0026). The swap
  stays a user-initiated Substitution.
- **Load-kind honesty.** Each scheme declares its compatible Load kinds, and selecting
  an incompatible scheme (Greyskull on a plank) is **rejected at selection time** — an
  honest "this scheme doesn't apply to this movement" beats a silent fallback that makes
  a movement behave unlike its label.

**Selected as a plan edit, never from the log flow.** A scheme is chosen in the
**Builder** for a Protocol-member Prescription (a tail-only edit, committed via Deploy —
ADR-0020) and **in place** for a standalone Session (the same no-AI plan edit posture as
Insert / Remove / Substitution — ADR-0051/0052). No AI, no record touched.

**Carried with the plan; generation stays scheme-agnostic.** The selection is a plan
property of the Prescription (like reps, load, rest, tempo), so it is copied faithfully
across Duplicate, Redeem, and Share (ADR-0043/0057) — not per-owner like Favorite.
Generation never selects a scheme in v1: every generated/adopted Prescription carries
the default, and a scheme is purely a user override. AI-chosen schemes are a clean
future extension, deferred.

## Pin is retired (supersedes ADR-0053)

Pin introduced a stored Pinned Target that suspended read-time Progression for one
pure-bodyweight occurrence. The scheme registry subsumes it:

- Pin's "stop auto-progressing this movement" job is the **Static** scheme — and Static
  is *better*, holding every future occurrence at the plan's authored values so
  later-week deloads survive, where Pin froze only the single next occurrence.
- Pin's "bank a specific higher rep target" job is a **Builder edit**, consistent with
  ADR-0053's own concession that Load and set-count edits belong to the Builder.

Retiring Pin removes "the first user-chosen plan number to persist outside the
Builder/Insert/Remove path": the scheme *selection* becomes the single new stored
plan-value in its place.

**Migration.** Each Prescription carrying a Pinned Target becomes `reps = <pinned
value>` + `scheme = Static`, preserving the user's intent exactly (their target holds,
nothing auto-steps it); the Pin columns are then dropped. `Pin` / `Pinned Target` leave
`CONTEXT.md`, and the terminology guard gains them as retired terms **in the same change
that removes the Pin identifiers** (`PinOffer`, `pin_offer`, `pinned_reps`), so the
guard's absent-from-tree self-test stays green.

## Considered options

- **Per-Protocol scheme instead of per-Prescription** — rejected: a generated Protocol
  mixes movements (a barbell squat and a plank in one week) that legitimately want
  different stepping, and it is odd to force a mobility session under a "Greyskull"
  umbrella. Per-Prescription with an inherited default gives zero-effort defaults and
  per-movement expressiveness.
- **A literal time/calendar-based scheme** — rejected: violates ADR-0001. Reinterpreted
  as session-count-based.
- **Silent fallback for incompatible Load kinds** — rejected: a movement labeled
  "Greyskull" that quietly behaves like Double Progression is dishonest; reject the
  selection instead.
- **Keep Pin alongside the schemes** — rejected: Static covers its main job with better
  deload behavior, and a bespoke-target edit belongs to the Builder. Keeping both would
  leave two stored plan-value overrides where one suffices.
- **Store the stepped result (bake progression in)** — rejected: it reintroduces the
  stored ledger ADR-0004/0018 removed; only the *selection* is stored, never the step.

## Consequences

- **The scheme selection is the one new stored plan-value**, replacing Pin's Pinned
  Target — a net-neutral change to the persisted plan surface.
- **The overlay gains a dispatch seam.** `progressed_prescription` stops calling
  `next_prescription` directly and instead resolves the Prescription's scheme (default
  when unset) and applies it; the scheme registry is the new curated set.
- **Backward-compatible by construction.** An unset selection is Double Progression,
  which is exactly today's behavior, so existing Protocols and records are unaffected.
- **`AMRAP` reps become meaningful.** Greyskull reads an AMRAP final set, so the rep
  grammar that today returns `None` for `"AMRAP"` and holds must gain an AMRAP-aware
  reading on that path.
- **Un-selecting is a clean restore**, like un-pin was: no history migration, no
  recomputation — the overlay simply resumes from the default.
