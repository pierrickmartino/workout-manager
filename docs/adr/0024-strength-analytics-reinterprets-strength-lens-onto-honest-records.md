# 0024 — Strength Analytics: a dedicated strength lens over honest records

Continuing the F-series stance (ADR-0008 Home, ADR-0011 Analytics, ADR-0017 Exercise
Detail), we add a dedicated **Strength Analytics** screen at `/analytics/strength`,
linked from `/analytics`. It *consolidates* the per-Exercise strength story that today
is only reachable if the user already knows which Exercise to open. It ships as read-time
projection over Logged Sets — no LLM, no stored ledger — and reuses the shipped
Estimated-1RM / PR / Muscle-Group engines (ADR-0010) rather than new strength logic, with
one deliberate exception recorded below. This ADR records the **screen-level decisions and
their deliberate deviations**, in the same spirit as ADR-0011/0017.

Concretely:

- **A separate screen, not an expansion of `/analytics`.** Account-wide aggregates
  (volume, session/active-day/set counts, the single-window muscle split) stay on the
  parent Analytics screen; per-Exercise strength trajectories and the full record history
  get their own home. Mixing per-Exercise drill-down into the account-wide page would blur
  two altitudes onto one surface.

- **Per-Exercise trajectory is ranked small-multiples, not a re-implemented chart.** The
  screen shows the top ~5–6 *qualifying* Exercises by recent frequency, each a mini
  Top-Set trend, tapping through to the canonical full chart on `/exercises/[id]`. It does
  **not** re-render the full trend here: ADR-0017 made Exercise Detail tell *one* strength
  story on one Est.-1RM yardstick, and a second, subtly-different chart on this screen
  would revive exactly the "three competing bests" problem 0017 killed. The small-multiple
  is a teaser; Exercise Detail remains the canonical single-story chart.

- **Muscle balance over time is a NEW computation — the one exception.** The existing
  `domain/muscle_groups.distribution` returns a **single-window snapshot** (what
  `/analytics` already renders); there is no time-series muscle projection anywhere. So
  "balance over time" is a new pure `muscle_groups` function (a per-week composition
  series) with its own unit tests — **not** presentation of an existing number. It is
  bucketed on **weeks**, deliberately reusing the Streak's weekly cadence (ADR-0001,
  self-paced and calendar-free): a daily muscle-balance chart would smuggle a calendar and
  a "daily quota" reading back into a model that rejects both. The chart is **descriptive
  only** — it *shows* distribution drift; *flagging* an under-trained bucket is a separate
  concern (the backlog's Muscle-Group Coverage-Prompts item), kept off this screen so the
  two don't collide. (That item was later designed as a *neutral* windowed-coverage signal
  that deliberately does **not** flag, on `/analytics` — see ADR-0025.)

- **PR history is the full all-time, all-Exercise timeline; `/analytics`'s feed becomes a
  teaser.** ADR-0011 caps the Recent Records feed at the last 8 PRs *because PRs are
  sparse* — that cap is a teaser, not the whole record. This screen shows the complete,
  paginated, **flat reverse-chronological** milestone stream across every Exercise (reusing
  `detect_personal_records` verbatim — here "presentation only" genuinely holds), and the
  `/analytics` feed is re-cast as a "recent" teaser that links in. Flat, not
  grouped-by-Exercise: the per-Exercise PR ladder already lives on Exercise Detail's RECORDS
  tab (ADR-0017); this is the "hall of records" timeline neither existing surface provides.

- **Explicitly the strength lens, and gated so non-strength users hit no wall.** Estimated
  1RM — the yardstick under both the trajectory and the PR timeline — exists *only* for
  absolute-Load sets in the trustworthy 1–12-rep window (ADR-0010, CONTEXT 'Estimated
  1RM'); it is undefined for bodyweight, %-1RM, qualitative, and range Loads. A yoga /
  mobility / bodyweight user would otherwise land on two empty sections that read as broken.
  Following ADR-0017 ("hide, never fabricate a `0 kg`") *and* the type-neutral posture
  (ADR-0018/0019, which exists so such a user never faces an all-locked strength wall), we
  **gate the nav entry** on the user having any qualifying strength history **and** keep
  honest per-section hides for the partial case (one benched lift but no others). A user who
  does reach the screen with nothing qualifying sees a single teaching empty state that
  names *why* ("strength trajectories need sets logged with a weight in kg and 1–12 reps"),
  not a wall of zeros. The screen is deliberately **not** broadened into a modality-neutral
  progress view — that is a different, larger feature (the Type-Neutral Coaching Narrative
  item), and folding it in here would dilute the strength focus and overlap `/analytics`.

- **Named "Strength Analytics", not "Strength Intelligence Dashboard".** "Intelligence"
  falsely implies an AI judging the user's strength — every figure here is a deterministic
  read-time projection with zero LLM involvement (the honest-projection stance of
  ADR-0018/0019), so the word fabricates a capability the screen doesn't have. "Dashboard"
  breaks the plain-noun screen naming (Home, Analytics, Exercise Detail, Profile). The
  screen name is a UI/naming call, not a new domain term, so `CONTEXT.md` is unchanged.

## Consequences

- This ADR **amends ADR-0011**: the Recent Records feed is now a teaser linking to the full
  PR timeline on this screen, rather than the only PR history surface. Every other ADR-0011
  reinterpretation stands.
- The "no new computation, only presentation" framing from the research backlog holds for
  the trajectory and the PR timeline, but **not** for muscle-balance-over-time, which ships
  a new pure `muscle_groups` weekly-composition function (with tests). Recorded here so a
  future reader doesn't mistake it for a stray re-computation of the existing snapshot.
- A future reader should treat the gated entry, the small-multiples-not-full-charts choice,
  the weekly (not daily) muscle buckets, and the flat all-time PR timeline as **deliberate**,
  not an incomplete port.
