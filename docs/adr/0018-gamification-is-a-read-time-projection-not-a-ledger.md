# 0018 — Gamification is a read-time projection of the record, not a ledger

F5 (Profile) needs a **gamification layer** — an experience currency ("XP"), an
account-wide level ("LVL 12"), a **Streak**, and **Achievements**. The obvious
implementation is an XP economy: an `xp_events`/counter table written by a hook
when a Session is logged, plus an `achievement_unlocks` table stamped when a
badge fires. This ADR records the decision to build **none** of that: every
gamification figure is a **pure read-time projection of the Logged Session /
Logged Set record**, exactly like the Personal Records engine (ADR-0010), with no
new table and no write-path hook.

**XP is a deterministic function of the record, never an awarded balance.** It
answers "what does 760 XP *mean*?" concretely: the XP-worth of everything the user
has honestly logged, recomputed on read. A corrected, back-dated, or deleted log
simply re-derives it, so XP can never drift from the logs — and it **backfills
every existing user with history for free**, with no migration for the counter.

**XP counts training-type-neutral units — Logged Sessions and attempted Logged
Sets — deliberately not volume or Session Duration.** Under a read-time model, XP
inherits every honesty caveat of whatever it is built on. Volume has a
conversion-coverage gap (ADR-0010/0011): a bodyweight or qualitative set often
yields no kg, so XP ∝ volume would pay a yoga / mobility / bodyweight trainee near
nothing for a real session — contradicting the first-class multi-training-type
design (`fitness_levels` is per type precisely because the types are equal
citizens). Session Duration is known only for live-tracked performances
(ADR-0014), so XP ∝ duration would punish the after-the-fact log. Counting
sessions and sets keeps a yoga session and a barbell session comparable and pulls
in no caveat. XP rewards **work performed, not plan adherence**, so an Incomplete
Logged Session (ADR-0013) still earns XP for the sets attempted.

**Operator Level is a pure, non-monotonic function of XP.** An escalating
closed-form curve (`level = ⌊√(xp / k)⌋`-shaped, unbounded, no stored table) maps
XP to the account-wide **Operator Level** — distinct in every dimension from the
per-type **Fitness Level** (see CONTEXT.md). The curve is an admittedly arbitrary
*motivational re-scaling*, and that is acceptable where a readiness percentage was
not (ADR-0008): the curve claims nothing about the world beyond "you have
accumulated this much XP," so it makes no false factual claim. Because Level is a
pure function of a re-derivable XP, it is **non-monotonic** — deleting logs lowers
XP and can lower the Level. That is the honest consequence of projecting the
record, and it is accepted uniformly across XP, Level, Streak, and Achievements.

**Streak and Achievements are the same projection.** The **Streak** is the run of
consecutive weeks with at least one Logged Session, read off the same distinct-date
basis as Analytics' active days. An **Achievement** is a curated, type-neutral
predicate over the logged history, "unlocked" iff it currently holds, with an
honest unlock date recovered as the earliest replay point it first held — no
unlock table, and it re-locks if the underlying logs are deleted.

## Considered options

- **Persisted XP ledger / unlock table** — rejected: the only thing it buys is
  rewarding actions *not in the record* (app opens, login streaks, onboarding),
  and in exchange it reintroduces a write hook, a backfill, a migration, and
  drift from the log — the exact coupling ADR-0010 was glad to avoid — for a
  reward surface this "operator instrument" product does not want.
- **XP from volume or Session Duration** — rejected: systematically unfair across
  training types and dependent on caveats (conversion coverage, live-only
  duration) the rest of the app carefully quarantines.
- **Monotonic ("once earned, always kept") Level / Achievements** — rejected: it
  requires storing a high-water mark, i.e. a partial ledger, breaking the
  single clean rule that everything is a projection of current logs.

## Consequences

- Gamification can reward **only** what appears in the Logged record — no login
  streaks, no non-training XP. Given the product identity, that is a feature.
- A new pure domain module (`domain/experience.py`, mirroring
  `domain/personal_records.py`) plus a read model and a `GET /api/profile/progress`
  endpoint; **no schema change, no migration** for the counter.
- The XP unit weights and the level-curve constant `k` are pure numbers, tunable
  later without any data change — the same "pure function, tune freely" property
  the Estimated-1RM window has.
