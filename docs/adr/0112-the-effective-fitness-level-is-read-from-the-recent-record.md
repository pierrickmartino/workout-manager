---
status: proposed
---

# 0112 — The Effective Fitness Level is read from the recent record

ADR-0004 §2 settled *that* logged progress folds into the **Fitness Level**, because the level
is a dimension of the generation cache key and so is the one channel through which history can
reach a future generation without breaking caching. It did not settle **how** the level reads
the record, and the implementation that filled that gap is wrong in both directions:

- It counts a Logged Session as evidence only when **every** Logged Set is rated at low
  perceived effort. The rating is **optional** at the log boundary and in the Live Session, so
  one blank field voids a whole Session and in practice the fold mostly never fires. The
  decisive fault is not coarseness, it is *silence*.
- It reads the user's **entire** history and is **monotonic upward**. Credit earned a year ago
  is still on the record forever, so a detrained user is planned for at their peak and nothing
  they do — not failing to finish, not grinding every set at maximum effort — makes the app
  reconsider.

This ADR settles how the level reads the record, and splits the term so that the question has a
name. It **refines ADR-0004 rather than superseding it**: all three of 0004's mechanisms stand,
mechanism 2 still folds a coarse level into the cache key, and the per-type 1–10 scale 0004
bought is unchanged. Only the fold's reading rule is decided here.

## Two levels, two names

`CONTEXT.md` carried one **Fitness Level** entry for two concepts the code already treated
differently. It splits into a qualified pair, shaped exactly like the **Default Equipment** /
**Available Equipment** pair two entries above it — a saved base versus what one use actually
runs with:

- **Declared Fitness Level** — the stored 1–10 per Training Type the user states about
  themselves. A mutable snapshot of "now", theirs to edit, and the **only** level ever written
  about them. The **floor** of the Effective level.
- **Effective Fitness Level** — the read-time projection the generation cache key and the
  Calibration band run with: Declared plus net recent evidence, never below Declared, capped at
  the top of the scale.

**Fitness Level** survives as the umbrella both are readings of. Both `_Avoid_` lines point at
each other, and both also point at **Operator Level**, which measures account-wide *investment*
rather than per-type *ability* and sits on the same Profile screen — the one confusion a reader
is most likely to make, because the two numbers will be rendered side by side.

## How the Effective level reads the record

Per Training Type, over a **window of the most recent Logged Sessions of that Training Type**:

- **The window is counted in sessions, never in days.** There is no "today" (ADR-0001), and
  `progression.py` already "never reads a clock". The session-count framing is the precedent
  ADR-0064's **Session-Count-Based** scheme set for the calendar-free reading of "recent".
- **Evidence is the Completion Outcome plus graded perceived effort, and nothing else.** A
  Session declared **Completed** whose rated sets all sat at or below the low-effort threshold
  counts *for* the user; one declared **Incomplete**, or carrying any set rated at or above a
  high-effort threshold, counts *against*.
- **An unrated set abstains rather than disqualifying.** This is the single biggest accuracy
  lever, and it is the precedent the codebase set twice already: the Calibration's lever
  resolution skips an undeclared Completion Outcome rather than reading it as Completed, and the
  catalog leaves a muscle **Unclassified** rather than guessing. A Session with no rating
  anywhere is neutral on the effort axis but still counted on its Completion Outcome — it does
  not leave the window, because "no effort evidence" is not "no session".
- **Completed-but-unrated is neutral, not comfortable.** Finishing the prescribed work is
  evidence the level is *right*, not that it is too low.
- **Net evidence, floored at the Declared level.** Strained Sessions cancel comfortable ones, so
  **credit is withdrawable** — both by decaying out of the window and by being contradicted —
  while the app never reads a user as less able than they say they are.
- **Relative to the Declared level, not an absolute reading.** Nothing in the domain maps "nine
  comfortable sessions" onto "Level 7". Relative also preserves what ADR-0004 bought: a
  continuous, one-notch-at-a-time climb.

The level stays a **read-time projection**: nothing is stored, no write hook fires, and there is
no migration — ADR-0018 paying off. A re-read of one history is idempotent, so correcting a
mis-logged Session corrects the level in the same instant, and deleting a Logged Session lets
the level fall again.

**One level serves both consumers.** The generation cache key wants stability and the
Calibration band wants responsiveness, but two divergent notions of "level" is exactly what the
band registry's pinning to the cache's own cut points exists to prevent. They read the same
projection.

## What is rejected, and why

Recorded here so that an implementer does not helpfully add them back:

- **Estimated 1RM and Personal Records as evidence.** Both exist only for **absolute-Load** sets
  in a trustworthy rep range, so a rule built on them would serve **strength** and abstain for
  cardio, hiit, yoga and mobility. That is the **single overall Fitness Level** mistake ADR-0004
  already rejected, arriving one Training Type at a time — and a user who mainly does yoga would
  get none of the accuracy the lifters get.
- **Volume as evidence.** Confounded: more work at higher effort is not more ability. Volume
  rises with a longer session, a lighter day's higher reps, and with simply trying harder at the
  same capacity.
- **Hysteresis or any deadband** against notch oscillation — see below. Ruled out, not deferred.
- **Coarsening the Effective level to the three bands before it reaches the cache key.** That
  would reverse ADR-0004's explicit purchase of a continuous climb to buy back hit rate 0004
  already decided to spend.

## Accepted costs

These are decisions, not defects, and they are written down so they are not re-litigated as
defects later:

- **No hysteresis; the notch count can oscillate.** Net evidence parked on a boundary flips as
  one Session enters the window and another leaves, changing the cache key and possibly the
  Calibration band. A deadband is not available to us: it needs the **previous** value, and
  storing that value is precisely the write-hooked ledger ADR-0018 forbids. The integer division
  that turns net evidence into notches already gives every notch a multi-session plateau, which
  is the stability we can have for free; more would cost a far more load-bearing invariant.
- **A wider cache spread.** The Effective level reaches the cache key at full 1–10 resolution,
  so one Declared level now fans out across several key partitions. It is **bounded**: at most
  **four notches** above a Declared floor that is stable because the user alone edits it.
  ADR-0004 already accepted a ~3× fragmentation on this dimension for finer personalization;
  this is the same trade, bounded.
- **Band shifts under a standing Calibration get more frequent.** A Calibration resolves the
  difference between the standing and the desired offset with the band read *at that moment*,
  and ADR-0111 already accepted that a Calibration is "not exactly reversible" for exactly this
  reason. A window-based level pays that cost more often. Storing the applied band beside the
  offset integer is the **fallback if it bites in practice** — a schema change not to be bought
  on speculation.
- **Existing users can read lower than they do today**, because all-time credit becomes
  windowed, so their next generation keys differently. No data changes and nothing was ever
  stored, so there is nothing to migrate or back-fill.
- **The progress read model stops being a function of the record alone.** The Effective level is
  served from the profile-progress read model — beside **Operator Level**, and deliberately
  **never** from the Profile endpoint, whose levels field is a validated *request* field as well
  as a response field and is written back by the Profile form, so a derived value there
  round-trips and the first careless save persists a projection into the baseline. That
  placement is what structurally prevents the ADR-0018 failure, and its price is that the read
  model gains the Declared levels as a second input, because the rule is Declared *plus*
  notches. This is acceptable: **ADR-0018 forbids *storing* projections, not reading a stored
  input into one**, and splitting one Profile screen across two endpoints is the worse trade.

## Nothing is added to the terminology guard

The guard's `BANNED_TERMS` registry is for *hard regressions* — a user-facing domain term the
codebase was deliberately moved away from, or one whose shape encodes a rejected design. **No
domain term is retired here.** **Fitness Level** survives as the umbrella concept and only gains
two qualified readings, and the fold's rename is a private identifier that no `CONTEXT.md`
`_Avoid_` line names. Padding the registry with private identifiers dulls exactly the
user-facing signal it protects, so the registry is left alone; a future user-facing phrase such
as "fitness score" would earn an entry, and this does not.

## Consequences

- **`CONTEXT.md` gains two entries and keeps the third.** Every existing cross-reference to the
  bare term is qualified: **Training Type** names the dimension the Declared level is held per,
  **Calibration** reads the **Effective** band, the **Fitness Profile** stores the **Declared**
  level and explicitly does not carry the Effective one, and **Operator Level**'s distinction is
  drawn against both readings.
- **ADR-0004 gains a forward pointer** to this ADR and is otherwise untouched.
- **No schema change, no migration, no stored column.** Nothing about the Effective level was
  ever stored.
- **The window's ordering becomes a precondition.** A fold over the *most recent* N Sessions
  depends on the history it is handed being newest-first. Today's all-time fold is
  order-insensitive, so this is a genuinely new risk: a change to that ordering would silently
  mis-window every user rather than fail. It must be documented at the function and **asserted
  in a test**, not trusted to a repository docstring.
- **Two windows exist, deliberately apart.** The Calibration keeps its short window for choosing
  *which lever moves* and reads the level's longer window for *how big a step is*. Different
  questions; they are not to be unified.
- **The Effective level becomes visible**, beside Operator Level, so the app's reading of a user
  and the user's own are legible side by side — and the equal case is stated rather than rendered
  as an absence, because "we read your record and found no change" is not the same message as
  "we failed to read it".

## Considered options

- **Make the effort rating mandatory at the log boundary** — rejected: the whole point is that an
  optional field stops being load-bearing. Forcing it would trade a silent fold for an obstructed
  log, and the record is the one thing in the domain that must stay cheap to write honestly.
- **Positional decay over all-time history** (weight each Session by how far back it sits)
  instead of a hard window — rejected: it is arithmetic no user can predict from the screen, and
  a window is explainable in one sentence ("your last N sessions of this type").
- **A time-decayed window** — rejected outright: it needs a clock, and there is no "today"
  (ADR-0001).
- **Store the folded level on the Fitness Profile** and update it on log write — rejected: it is
  the stored, write-hooked ledger ADR-0018 exists to forbid, and it is what makes the current
  behaviour irreversible.
- **A second, separate level for the Calibration band**, responsive where the cache key's is
  stable — rejected: two notions of "level" drift apart, which is what the band registry's
  pinning to the cache's cut points already exists to prevent.
- **Leave the fold alone and let the user correct their Declared level instead** — rejected as
  the primary remedy: ADR-0004 §2 promised that the app notices, and a feature that reads as
  broken rather than conservative is not fixed by asking the user to do its job. Editing the
  Declared level remains available and now takes effect at once, keeping earned evidence.
