# 0054 — The Training Heatmap is a descriptive daily projection, not a chain

F5 (Profile) gains a **Training Heatmap** — a GitHub-style mosaic of the trailing
~53 weeks, one cell per day, shaded by how much the user trained. This is a **pure
read-time projection** of the Logged Session record (ADR-0018): no new table, no
write hook, no migration — the same shape as the Streak, XP, and Personal Records
engines. That part is uncontroversial. This ADR records the part that is: adopting a
**per-day** grid at all, when ADR-0001 made the domain deliberately calendar-free
("no today") and CONTEXT.md lists **"daily streak"** and **"don't-break-the-chain"**
under _Avoid_.

**We adopted the daily grid but fenced off every daily-chain mechanic.** The domain's
objection in ADR-0001/0019 is to *pressure mechanics* — a daily-streak counter,
missed-session reconciliation, a chain the user must defend through legitimate rest
days — **not** to ever displaying a date (History already shows dates). So the
Heatmap is strictly **descriptive record texture**: it derives **no** "current daily
run," **no** "longest daily streak," and **no** daily-based Achievement. The weekly
**Streak** remains the *sole* consecutiveness metric. Empty days render as **neutral
background**, never a shaming pale cell, and read as *"nothing logged"* — never
*"missed."* The guardrails are the design; without them this would be exactly the
mechanic the domain rejected.

**A cell is graded by attempted Logged Sets that day, on fixed thresholds.** Set
count is **training-type-neutral** (a yoga set and a barbell set count equally, like
XP — ADR-0018) and needs no Load resolution, so it drags in none of the volume
coverage gap or the live-only-duration caveat that rule volume and Session Duration
out. The shade buckets are **fixed, coarse, tunable module constants** (like the XP
weights and the Estimated-1RM window), never **per-user relative quantiles**: a
relative scale would **retroactively recolor a past day** when a bigger day is logged
later, quietly contradicting the "a performed record is settled and never re-rendered"
spirit (ADR-0020). Under fixed thresholds a day's cell is a function of *that day's
record alone* and never mutates under later logs.

**Window, alignment, and placement.** The frame is a **rolling trailing ~53 weeks**,
not a fixed Jan–Dec calendar year: a January reset is an arbitrary calendar
commitment the self-paced model avoids, and a New-Year view would be near-empty.
Columns are **Monday-aligned**, reusing `domain/week.week_start` so the Heatmap can
never drift onto a different week edge than the Streak and Weekly Distance. A user
with under a year of history renders the **full frame with neutral pre-history**
(stable width; the empty region reads as "nothing here yet," not failure). It lives
on **Profile**, beside the weekly Streak — not on Analytics, whose 30/90/150-day
range toggle a trailing-year view does not fit.

## Considered options

- **Weekly-column intensity band** (one cell per week, ~52 cells) — rejected: it
  fully honors the weekly posture but is no longer a recognizable heatmap, and the
  record honestly holds per-day dates, so showing them is not dishonest once the
  chain mechanics are removed.
- **Grading by volume or Session Duration** — rejected on sight: volume has the
  conversion-coverage gap and duration is live-only (ADR-0018 refuses both for XP
  for exactly this reason).
- **Per-user relative (quantile) shade buckets** — rejected: retroactively recolors
  settled days as new logs arrive.
- **Fixed Jan–Dec calendar year** — rejected: an arbitrary calendar reset in a
  calendar-free domain, near-empty every January.

## Consequences

- A new pure `domain/heatmap.py` (mirroring `domain/streak.py`: performed dates +
  attempted-set counts in, dated fixed-bucket cells out) plus a **separate**
  `GET /api/profile/heatmap` endpoint through the standard envelope — deliberately
  **not** folded into `GET /api/profile/progress`, so the always-fetched progress
  payload stays lean and the ~371-cell series is fetched only when wanted.
- The shade thresholds are pure numbers, tunable later with no data change.
- The Heatmap can surface **only** what the record holds; like the rest of the
  gamification layer it rewards nothing that is not a Logged Session/Set, and it
  re-derives (and re-colors) honestly when logs are corrected or deleted.
