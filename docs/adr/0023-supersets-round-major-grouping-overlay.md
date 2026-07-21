---
status: accepted
---

# 0023 — Supersets are a round-major grouping overlay, generated and hand-built

Until now a Session was a **flat, ordered list** of Exercise Prescriptions: the Live
Session (ADR-0012) flattens them *module-major* (all sets of one Prescription, then all
sets of the next) and rest is a per-Prescription value. F4's Builder (ADR-0020/0021) let
a user author that flat list by hand. This ADR introduces the **Superset** — the first
grouping layer over Prescriptions — and records how it stays honest against the domain's
Live model, its cache, and above all its safety posture. It **amends ADR-0012** (Live
ordering and rest) and **ADR-0006** (the generation schema and `parse_*` boundaries).

**A Superset is a round-major overlay, not a badge.** It is an ordered group of two or
more contiguous Prescriptions within one Session, performed in **rounds** — one set of
each member in turn — resting only at the **round boundary**, never between members (see
`CONTEXT.md`). One umbrella term covers two members and many; there is deliberately no
separate "circuit"/"giant set", because the round-major behaviour is identical regardless
of member count, so a second term would split on member count alone. It changes *order and
rest*, never what a set is — reps, Load, and per-Exercise muscle attribution are untouched.

**Members share a set count; the group owns the rest.** A Superset is exactly N rounds and
every member has N sets — **equal set counts are enforced**, which makes "round" a clean,
checkable invariant and keeps the Live interleaving unambiguous. Rest at the round boundary
means a member's own `rest_seconds` is meaningless inside a group, so the **Superset owns a
single round-rest**; members' individual rest goes dormant while grouped (and returns intact
when ungrouped). This is reorder-stable — rest belongs to the group, not to whichever member
lands last. Forming a group seeds the round-rest from the last member's rest as a default.

**Live stays one-set-at-a-time; only the expansion order and rest timing change (amends
ADR-0012).** `initLiveSession` interleaves grouped members round-major (`A1, B1, A2, B2…`
instead of `A1, A2, B1, B2…`); the single current-set pointer, `COMPLETE_SET`, hydration/
resume, idle auto-end, and Completion Outcome are all untouched. The rest timer fires only
after the last member of each round. Grouping is *communicated* — a round badge and the
co-member preview — rather than by restructuring the screen. The header's `x of y` counts
**units** (a Superset is one unit alongside solo Prescriptions), and `previous_performance`
alignment is unaffected (each member is still its own Exercise, keyed by set ordinal).

**Generation emits Supersets; the cache key does not move (amends ADR-0006, respects
ADR-0003).** The LLM returns prescriptions carrying an optional group tag + intra-group
order; every `parse_*` boundary and the fake-LLM fixtures learn about groups. Grouping lives
in the generated *output*, not the request parameters, so the coarse cache key (ADR-0003) is
unchanged — Supersets ride inside the immutable artifact and deep-copy on Adopt like
everything else.

**One shared validator defines a valid Superset, and it is also a safety gate.** The
equal-counts / contiguity / ≥2-members / one-round-rest rules live in a **single pure
validator** used by *both* the generation parse boundary and the DEPLOY gate — one source of
truth for "what a valid Superset is", not two copies. That validator additionally takes
`has_sensitive_constraint`: a user with any **Sensitive Constraint** (injury, rehab,
postpartum, medical) is **never given a Superset**, whether the AI proposed it or they built
it by hand. Supersets compress rest and raise intensity — exactly the load those users must
not be handed — so this is a safety rule of the same class as the cache bypass (ADR-0003),
enforced at the seam rather than trusted to a prompt. A non-medical **Preference / Limitation**
does *not* suppress Supersets.

**The remedy for an invalid Superset is path-dependent.** The validator stays a pure "here
are the violations" function; the *caller* decides what to do, because only the caller knows
whether a human is watching:

- **DEPLOY (manual):** hard-reject with a locatable error (`superset_uneven_sets`,
  `superset_non_contiguous`, `superset_forbidden_under_sensitive_constraint`), like every
  other deploy validation — the user fixes the named group and re-deploys; the plan is never
  silently mutated.
- **Generation (passive):** **degrade-to-flat** — the parse boundary ungroups the offending
  Superset (keeps the Prescriptions, drops the grouping) and accepts the generation, so a
  ragged group or a stray group for a Sensitive-Constraint user never costs the user their
  whole session.

**The Builder groups by drag, over a keyboard-accessible floor.** Dragging one row onto
another forms/joins a group; dragging reorders (so drag-to-reorder lands here too). Because
free dragging can pull a member out from between others, **contiguity becomes an enforced
invariant** the reducer maintains and DEPLOY validates, not a guarantee of the gesture.
Drag-and-drop is an *enhancement* over the existing `aria`-labelled arrow/button controls,
which remain the accessible path — DnD must not be an accessibility regression. When the
Builder opens for a Sensitive-Constraint user, it **auto-unlinks groups in the draft** (a
safety-driven, staged-not-committed degrade) with a banner, so they never hit a confusing
hard-block on an unrelated edit; the validator remains the backstop at DEPLOY. In the Builder
*specifically*, a Superset renders as a **visible bordered container** the user drags members into
(the drop target for grouping), with the A/B/C member badge kept *inside* it; Live and read-only
views stay badge-only per the "communicate grouping rather than restructure the screen" choice
above — the container is an authoring affordance, not a change to the Live model.

## Considered options

- **Manual-only grouping (generator stays flat)** — rejected: we chose to let the AI
  prescribe Supersets, accepting the larger schema/parse/fixture surface, so a generated plan
  can arrive already grouped rather than requiring hand-assembly.
- **Unequal member set counts / ragged rounds** — rejected: "round 4 = just B" frays the
  round concept and muddies round-boundary rest; the user can simply not group the odd-count
  Exercise.
- **Last-member `rest_seconds` as the round rest (no new field)** — rejected: a positional
  convention that silently changes owner on reorder and leaves other members' rest inert.
- **Whole-round-on-screen Live** — rejected: a large Live rewrite (the pointer stops being
  "one set"); the round badge + co-member preview communicate grouping without it.
- **Link-to-next chain gesture** — not chosen: drag-onto-row was preferred, which also pulls
  drag-to-reorder into scope and turns contiguity into an enforced invariant.
- **Uniform hard-reject on invalid grouping** — rejected for generation: failing/retrying a
  whole generation over one bad group is a worse trade than degrading that group to flat.
- **A second "Circuit"/"giant set" term** — rejected: no behavioural difference behind it.

## Consequences

- Net-new surface: a grouping tag + round-rest on the Prescription/generation schema, a
  shared Superset validator (safety-parameterised), Live round-major expansion, DnD in the
  Builder, and updated `parse_*` boundaries and fake-LLM fixtures.
- **The validator is a safety boundary, not just a shape check** — a future reader will find
  a "valid Superset" function that also reads a medical flag; that coupling is deliberate and
  recorded here.
- **Drag-to-reorder is now in scope** (same pointer mechanism as grouping), and the arrow/
  button controls must survive as the accessible floor.
- **Analytics, Personal Records, Estimated 1RM, Top Set, and volume are unaffected** — they
  key off individual Logged Sets, and grouping changes only order and rest, not per-Exercise
  attribution. This "no" is asserted so it is not re-litigated.
- Equal-counts and non-nesting are user-facing constraints a future reader may question;
  relaxing either later means revisiting the Live interleaving and the validator together.
- **The round-rest wins over the global default-rest preference.** "The Superset owns a
  single round-rest" is honest only if that value is not silently overridden: a user's
  global default-rest (issue #121) applies to **solo** Prescriptions, but a Superset's
  explicit `round_rest_seconds` is used as-is at the round boundary (falling back to the
  global default → the 90s constant only when no round-rest is set). Otherwise the global
  default could shorten a Superset's prescribed rest — the intensity-raising direction this
  ADR's safety posture guards against — or lengthen it and defeat the Superset's purpose.
