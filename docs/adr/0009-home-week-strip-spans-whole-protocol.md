# 0009 — Home week strip spans the whole Protocol, not just the current week

ADR-0008 scoped the Home week strip to the Sessions of the Current Protocol's
**current week** — a row of dots, one per Session in that one week. In practice
this conflated two axes: a `WEEK n/total` overline (weeks) sitting beside dots
that were actually the current week's Sessions (e.g. "WEEK 1/4" next to 3 dots
for a 3-sessions/week Protocol), so the dot count never matched the "/4" and the
strip failed to answer the question users actually ask — *how far am I through
the whole Protocol, and what is still to be done?*

The strip now spans the **entire Protocol**: one rounded, segmented pill per
week across all weeks, each pill carrying one cell per Session in that week
(done / active / upcoming). Past weeks read as fully filled pills, the current
week's pill takes an accent ring with its Next Session cell brightest, and
future weeks read as hollow pills. Pills wrap to fit, so the map stays legible
across the full Protocol range (1–52 weeks × 1–14 sessions per week). The
`WEEK n/total` overline stays; the protocol-level `X / N` completion count stays
on the Queue, unduplicated. The strip remains a read-only orientation map — all
navigation stays in the Queue.

This **supersedes ADR-0008's "week strip shows the current week's Sessions"
bullet only**; every other reinterpretation in ADR-0008 stands. Its honesty
constraints are preserved intact: the map is positional, never calendrical, and
a per-week pill fill is a count of **binary** Session completions ("2 of 3 done
this week"), never a fabricated per-session percentage.
