# 0033 — A plan-less log resolves its Exercise by search-and-create, minting a `user_entered` movement

ADR-0031 lets a Logged Session stand alone and says its movement "resolves to a
catalog Exercise ('Running') like any movement." But in the normal flow **AI
generation is what mints and enriches a catalog Exercise**, and an ad-hoc log has no
AI call — yet the log's boundary guard (`log_session`) requires every `exercise_id`
to reference a real catalog Exercise. So nothing could put "Running" in the catalog,
and a fresh user could not log "Push-up" either. This ADR records how a plan-less
log obtains a valid Exercise, and amends ADR-0002's Provenance to cover it.

**The mechanism is search-and-create-by-name.** The client shows a picker over the
existing catalog search; on a miss the user confirms a typed name and a new endpoint
**`POST /api/exercises`** resolves-or-creates a catalog Exercise and returns its
`id`. The log itself still posts an `exercise_id`, so the `log_session` guard is
**unchanged** — still id-only, still `UnknownExerciseError` on a bad id. A
picker-only approach was rejected because a brand-new user has an essentially empty
catalog, and seeding cannot cover every barbell/dumbbell movement; create-by-name is
the general fallback the empty-catalog case forces.

**Create lives beside the log, never inside it.** Resolve-or-create is its own
endpoint over the existing `find_or_create` dedup primitive (ADR-0002), not folded
into the log write. ADR-0031 is explicit that the log path mints nothing ("one
nullable FK", "the log never mints a movement"), and `log_session`'s
`UnknownExerciseError` invariant — every Logged Set references a *real* catalog
Exercise — is only meaningful if the log path cannot manufacture the very Exercise it
validates. Growing the catalog is a distinct, user-confirmed interaction, so it is a
distinct call. The cost is one extra round-trip on the first-ever log of a truly
novel movement; seeded and previously-known movements resolve in the picker with no
extra call.

**A user-typed movement is a third Provenance, `user_entered`.** A user who types
"Running" and creates a bare row is neither `ai_generated` (no AI invented or
enriched it — the whole premise of ADR-0031) nor `curated` (no human reviewed it).
Reusing `ai_generated` would be exactly the dishonest labelling this codebase refuses
elsewhere, and would misroute the #107 re-enrichment pass (which reads
`ai_generated` rows assuming the AI at least attempted muscle data). So ADR-0002's
binary Provenance becomes a **trichotomy** — `curated` (trusted), `ai_generated`
(unvalidated), `user_entered` (least-validated, born name-only). It slots in cleanly:
search ranks curated → ai_generated → user_entered; `list_by_provenance` stays
`ai_generated`-only so bare user rows are not swept up by the AI-muscle pass; and a
most-cautious tier is *more* honest for the injury/rehab safety posture, not less.

**A `user_entered` row is enrichment-eligible, provenance-preserving — later.** It is
born with only a name, so its Exercise Detail is sparse and its logged sets fall into
the **Unclassified** Muscle Group until enriched — the already-documented, honest
degradation, not a bug. The policy is that a future async pass (mirroring the ADR-0005
on-miss and #107 re-enrichment patterns) fills muscles/steps/difficulty **without
changing the `user_entered` origin** — a user typed it, and adding muscle data does
not make that untrue. Implementing that pass is out of scope for the unblocking slice.

**Common cardio/mobility movements are seeded as `curated`.** With create-by-name as
the mechanism, seeding is a *quality* layer, not load-bearing for unblocking — but AI
generation only ever mints Exercises for *prescribed* work, so cardio like running or
cycling would otherwise live forever as bare `user_entered` rows with empty Detail,
for the single most common plan-less activity. A small, fixed set — **Running,
Walking, Cycling, Rowing, Swimming, Elliptical, Jump Rope, Plank, Stretching, Yoga**
— is seeded (migration `0019`) as `curated`, each with a coarse Muscle Group roll-up
and one honest Execution Step; mobility work (Stretching, Yoga) is left unmapped
rather than assigned a fabricated group. This is the first real use of the `curated`
slot. Strength movements are left to generation + create-by-name.

## Considered options

- **Reuse `ai_generated` for user-typed entries** — rejected: dishonest (no AI was
  involved) and it misroutes the AI-muscle re-enrichment pass.
- **Enrich synchronously on create so the entry is legitimately `ai_generated`** —
  rejected: reintroduces an AI call and its latency onto the lightweight log path,
  contradicting ADR-0031 ("an ad-hoc log has no AI call").
- **Fold resolve-or-create into `log_session`** — rejected: makes the log path mint
  movements and guts the `UnknownExerciseError` invariant (ADR-0031/0002).
- **Seed only, no create-by-name** — rejected: cannot cover the arbitrary movement a
  fresh user logs (the "Push-up" case), which seeding structurally can't enumerate.
- **Seed nothing, everything `user_entered`** — rejected: condemns the most common
  plan-less movements (cardio) to permanently bare Exercise Detail and invites
  near-duplicate proliferation on the highest-traffic movements.

## Consequences

- The `log_session` boundary and its guard are untouched; the plan-less logging slice
  (parent #233) consumes the picker + `POST /api/exercises` to obtain an `exercise_id`
  and posts it exactly like a plan-backed set.
- The shared global catalog gains a user-writable surface. Pollution (typos, junk)
  is *bounded and auditable* — the same posture ADR-0002 already took toward near-dups
  ("tolerated on purpose, reconciled later"): `user_entered` ranks last in search, the
  create endpoint rejects blank and over-long names, and the Provenance tag makes a
  later curation/merge pass possible. A profanity filter and rate-limit are deliberately
  **not** built in v1 (YAGNI).
- Whether the Exercise Library *browse* (ADR-0021) hides `user_entered` rows is left to
  that ADR to settle (default: hide); the **log picker** must search all provenances so
  dedup/reuse works.
- Substitution over a bare `user_entered` movement finds no catalog relationships and
  falls to its AI path — it still works, just not lookup-rich until enrichment lands.
