# Fitness Level accuracy — settled design

Status: **design agreed, nothing implemented.** Captured from a grilling session; the
decisions below are settled, the code is not written. The ADR this becomes is **ADR-0112**
(see §7).

## 1. The problem, as found

`advance_level` (`apps/api/app/domain/fitness_profile.py:106`) is the only thing that moves a
**Fitness Level** from the record. As written it:

- counts a Logged Session as *strong* only when it is non-empty **and every** Logged Set has
  `perceived_difficulty ≤ LOW_EFFORT_MAX` (7);
- grants +1 notch per 3 strong sessions of a Training Type, over the user’s **entire** history,
  capped at 10;
- is **monotonic up only** — nothing lowers it;
- reads **nothing else**: not Completion Outcome, not load progression, not estimated 1RM, not
  volume.

The decisive fault is not coarseness, it is silence. `perceived_difficulty` is
`int | None`, default `None`, optional at the log boundary (`routes/logs.py:95`) and in the
Live Session — so a single unrated set voids a whole session, and in practice the fold
**mostly never fires**. A user who detrains also keeps every notch they ever earned, forever.

Two consumers read the folded value, both passing the full history:

| Consumer | Call site | What it wants from the level |
| --- | --- | --- |
| Generation cache key | `generation/protocol_service.py:64`, route `routes/protocols.py:158` | stability — each level is a cache partition |
| Calibration band | `protocols/calibration.py:236`, cut points 4 / 8 | responsiveness — it sizes one notch in kg |

Neither is visible to the user: `fitness-profile-summary.tsx:64` renders the *declared*
baseline.

Two hard constraints bind any fix:

- **ADR-0001** — calendar-free. There is no "today"; `progression.py` "never reads a clock".
  "Recent" must therefore be counted in **sessions**, not days.
- **ADR-0018** — read-time projection. No stored column, no unlock table, no write hook.

## 2. The rule

One level serves both consumers (two divergent notions of "level" is what
`calibration.py:236`’s own comment exists to prevent).

```
effective_fitness_levels(declared, logged_sessions, *, window, sessions_per_notch) -> dict[str, int]
```

Per Training Type, over the most recent `window` Logged Sessions **of that type**:

- **quorum** — fewer than `sessions_per_notch` sessions in the window ⇒ effective = declared.
  A first-day user reads as their declared level, which is right anyway: ADR-0111 already
  holds that the Fitness Profile alone is a legitimate basis for a Calibration.
- **comfortable** — the session declared **Completed**, **and** at least one set is rated,
  **and** every rated set is `≤ LOW_EFFORT_MAX` (7).
- **strained** — the session declared **Incomplete**, **or** any rated set is
  `≥ HIGH_EFFORT_MIN` (9).
- `notches = max(0, (comfortable − strained) // sessions_per_notch)`
- `effective = min(MAX_FITNESS_LEVEL, declared + notches)`

Settled parameters: `window = 12`, `sessions_per_notch = 3` (the existing
`strong_sessions_per_level`), `HIGH_EFFORT_MIN = 9`.

### Why these shapes

- **Window, not all-time** (counted in sessions, per ADR-0001): 30 strong sessions two years
  ago must not hold a detrained user at Level 9. Positional decay was rejected as arithmetic
  no user can predict from the screen. The session-count framing follows the precedent
  ADR-0064’s Session-Count-Based scheme already set.
- **Unrated sets abstain**, they do not disqualify. This is the single biggest accuracy lever,
  and it is the precedent the codebase set twice already: `_recent_outcomes` skips an
  undeclared outcome rather than reading it as Completed, and the catalog leaves a muscle
  **Unclassified** rather than guessing. A session with no rating anywhere is neutral on the
  effort axis but still carries its Completion Outcome — it does not leave the window, because
  "no effort evidence" is not "no session".
- **Net evidence** makes credit withdrawable without ever claiming the user is worse than they
  say. A strained session cancels a comfortable one; the floor is the declared level.
- **Completed-but-unrated is neutral, not comfortable.** Finishing the prescribed work is
  evidence the level is *right*, not that it is too low.
- **≥9, not ≥8**, for high effort. The 8 would make every set that is not comfortable a strain
  and collapse the neutral middle RPE 8 exists to occupy. The resulting asymmetric gap
  (≤7 comfortable · 8 neutral · ≥9 strained) mirrors the deliberate asymmetry already in
  `HARDER_STEP_KG` vs `EASIER_STEP_KG`: the cautious direction travels further.
- **Relative to the baseline** (`declared + notches`), not an absolute reading. Nothing in the
  domain maps "9 comfortable sessions" onto "Level 7". Relative also preserves what ADR-0004
  bought: a continuous one-notch-at-a-time climb.
- **Effort and Outcome only** — no 1RM, no volume. Estimated 1RM exists only for absolute-Load
  sets in a trustworthy rep range, so a rule built on it would work for strength and abstain
  for cardio, hiit, yoga and mobility — reintroducing the single-overall-level mistake ADR-0004
  rejected, one Training Type at a time. Volume is confounded (more work at higher effort is
  not more ability).

### Properties worth asserting

- **Mutually exclusive by construction.** A session cannot be both: Completed excludes
  Incomplete, and "all rated ≤7" excludes "any rated ≥9".
- **Bounded.** `effective ∈ [declared, min(10, declared + window ÷ sessions_per_notch)]` — at
  most **+4** at `window = 12`. This is the real bound on the cache spread accepted in §6.
- **Idempotent** for a given history: a pure re-read, no accumulation, no double-counting.
- **Order is now a precondition.** Today `advance_level` is order-insensitive. After this
  change it depends on `list_for_user`’s documented newest-first order, which becomes
  load-bearing. Document it at the function and assert it.

### Two windows, deliberately

`protocols/calibration.py` keeps **`RECENT_WINDOW = 3`** for `resolve_lever` ("which lever
moves") and gains the **12**-session window for the band ("how big a step"). Different
questions, different windows. Do not unify them.

## 3. Naming

`CONTEXT.md` has one entry for two concepts. It splits into a qualified pair, directly
parallel to **Default Equipment** ("the saved base") vs **Available Equipment** ("what a single
generation actually runs with") — two entries above it, same axis-shape, each `_Avoid_` line
pointing at the other:

- **Declared Fitness Level** — the stored 1–10 per Training Type the user states about
  themselves. A mutable snapshot of "now". The floor of the effective level.
- **Effective Fitness Level** — the read-time projection the generation cache key and the
  Calibration band actually run with: the Declared level plus net recent evidence, never below
  it, capped at 10.

**Fitness Level** stays the umbrella concept. `_Avoid_` for the new pair must also keep
pointing at **Operator Level** (account-wide *investment*, `domain/experience.py`) — a
different axis on a different concept.

Code: `advance_level` → **`effective_fitness_levels`**. A function whose name asserts one
direction while the body does two is a lie that outlives the ADR. Nothing is added to
`terminology_guard.py`’s `BANNED_TERMS`: no *domain* term is retired here, and padding the
guard with private identifiers dulls exactly the user-facing signal it protects. A future
user-facing phrase like "fitness score" would earn an entry; this does not.

## 4. Surfacing

The Effective level becomes visible — otherwise the profile shows one number while the system
serves plans and sizes Calibration steps by another.

It is served from the **profile-progress read model**, beside `OperatorLevel` — **never** from
`GET /profile`. That endpoint is one shape in both directions: `fitness_levels` is a request
field with a validator (`routes/profile.py:46`, `:52`) and a response field (`:101`), and
`ProfileForm` writes it back. A derived value in that payload round-trips, and the first
careless save writes a projection into the baseline — the stored-ledger failure ADR-0018 exists
to prevent, arriving through the front door. The placement is what structurally prevents it.

Deferred deliberately: showing the band at the Calibration control ("one notch ≈ 5 kg at your
level"). Genuinely useful, but it is a copy and click-budget question for
`calibration-control.tsx` (ADR-0071) and would smuggle a UI redesign into a domain change.

## 5. Surface to change

Nothing stored changes, so **there is no Alembic migration** — ADR-0018 paying off.

**API**
- `app/domain/fitness_profile.py` — rename and rewrite the fold; its `_LoggedSessionRecord`
  protocol grows `completion_outcome`. Reading `perceived_difficulty` remains sufficient and
  needs no RIR branch: `routes/logs.py:196` already normalizes a typed Effort into it
  (`int(round(effort.as_rpe))`).
- `app/domain/effort.py` — new `HIGH_EFFORT_MIN = 9`, beside the RPE/RIR scale bounds.
  `LOW_EFFORT_MAX` stays in `progression.py`; relocating it is a separate refactor.
- `app/config.py` — `fitness_level_window: int = 12` beside `strong_sessions_per_level: int = 3`.
- `app/generation/protocol_service.py:64`, `app/protocols/calibration.py:236` — call sites.
- `app/routes/profile_progress.py` (+ its read model) — expose the Effective level.

**Web**
- `lib/` view-model with a co-located `*.test.ts` rendering Declared vs Effective; the
  component stays thin. House rules that apply to the copy: typeset apostrophes (ADR-0101),
  `SectionHeader`/heading ranks (ADR-0094), `text-balance` on a display heading (ADR-0101).

**Tests** (`tests/test_profile_domain.py`, `tests/test_level_folding.py`)
- quorum: under `sessions_per_notch` ⇒ declared, exactly;
- an unrated set abstains; a wholly unrated session is neutral on effort yet still counted on
  its Outcome;
- a Completed, wholly unrated window ⇒ declared (no credit for mere adherence);
- mutual exclusivity; the `[declared, declared+4]` bound; idempotence over one history;
- withdrawal: strained sessions cancel comfortable ones but never breach the floor;
- the newest-first order precondition;
- the ADR-0111 band registry test still holds `INTERMEDIATE_MIN_LEVEL` / `ADVANCED_MIN_LEVEL`
  to the cache’s own cut points.

## 6. Accepted consequences

- **Wider cache spread.** The Effective level reaches the cache key at full 1–10 resolution —
  coarsening it to the 3 bands for the key was rejected as a reversal of ADR-0004’s explicit
  purchase of continuity. Bounded at +4 notches above a stable declared floor (§2).
- **No hysteresis; the notch count can oscillate.** Net evidence parked on a boundary flips as
  one session enters the window and another leaves, changing the cache key and possibly the
  band. A deadband needs the *previous* value, and storing it is precisely the write-hooked
  ledger ADR-0018 forbids. The `// sessions_per_notch` floor already gives every notch a
  3-session plateau; buying more stability costs a far more load-bearing invariant.
- **Band shifts under a standing Calibration get more frequent.** `calibrate_prescription`
  resolves `offset(desired) − offset(standing)` with the band read at that moment; ADR-0111
  already accepted this ("not exactly reversible… the band, the lever or a floor changing
  between acts"). A window-based level pays that cost more often. Storing the applied band
  beside the offset integer is the fallback if it bites in practice — a schema change not to be
  bought on speculation.
- **Existing users can read lower than they do today**, since all-time credit becomes windowed.
  Their next generation keys differently. No data changes; nothing was ever stored.

## 7. Documentation

**New ADR-0112**, refining — not superseding — ADR-0004. Its three mechanisms all stand and
mechanism 2 still folds a coarse level into the cache key; 0112 settles *how* that mechanism
reads the record. A one-line forward pointer goes into ADR-0004. The two consequences a future
reader would otherwise re-litigate must be written down explicitly: **no hysteresis, because a
deadband needs stored prior state**, and **the +4-notch cache spread**.

`CONTEXT.md`: split the **Fitness Level** entry into the Declared / Effective pair of §3.
