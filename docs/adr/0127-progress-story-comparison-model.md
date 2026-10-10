# 0127 — Progress story comparison model

**Status:** accepted

Strength analytics and the Exercise page show Estimated-1RM trajectories and Personal Record
timelines. Those are models and maxima, and they don't answer the question a user asks after a
session: *did I do better than last time on this exercise, and how exactly?* An Estimated 1RM can
rise while nothing the user did is directly comparable, so a modelled number can claim progress
the logbook can't show. Source: `docs/design/pulse-creative-directions.md` §6 ("Show progress as a
short, verifiable story"), spec #649.

**Each Exercise gets a Progress Story: one exact comparison of the latest Logged Session with the
most recent earlier one that can be compared with it.** The story holds one quantity equal and
measures the other, using only what was logged. The two Logged Sessions are shown side by side,
each linking to its record, so the claim can always be checked.

- **Exact comparisons only.** The story never uses an Estimated 1RM (ADR-0017), not even as a
  fallback. An estimate is a model; a story that falls back to one would read as a fact the
  logbook doesn't support. When nothing is exactly comparable the story is `insufficient` and
  says how to earn one: "No comparable sessions yet. Repeat a load or a rep count from last time
  to see what changed."
- **Latest against the most recent earlier comparable session.** The latest Logged Session
  holding a non-warm-up set of the Exercise is compared with the most recent earlier one that
  matches under the rules below; earlier sessions are scanned backwards until one matches or the
  history runs out. It is always "last time", never a date or a time window, because training is
  self-paced (ADR-0001). Sessions order by date, then id, whatever order the repository returns.
- **Shared load first, then shared reps.**
  1. *Shared load:* the loads present in both sessions. Take the heaviest and compare the best
     reps each session did at it (axis `reps_at_load`).
  2. *Shared rep count:* otherwise, the rep counts present in both sessions. Take the heaviest
     and compare the heaviest load each session lifted for it (axis `load_at_reps`).
  3. Otherwise `insufficient`.

  Heaviest, because it is the user's most meaningful work; the shared load comes first because
  more reps at the same weight is the most direct statement of progress. A consequence: the
  shared-rep rule never reports "the same". Equal heaviest loads at a shared rep count are
  themselves a shared load, so rule 1 claims the pair first; rule 2 only ever states a gain or a
  loss ("+2.5 kg for 5 reps.", "−2.5 kg for 5 reps."). The rule applies to a pair, and the scan
  stops at the first earlier session either rule matches: a nearer reps-only match beats an
  older shared-load one.
- **Loads match at logged precision.** Kilograms are stored exactly (a pound entry keeps the
  conversion's residue, #417), so loads are compared rounded to the gram: two entries of one
  logged load match, and two loads a user could tell apart (60 and 60.25 kg) never do.
- **Warm-ups are ignored** (ADR-0065). A session that only warmed up on the Exercise is not a
  performance of it.
- **Eligible Load kinds.** Absolute, and bodyweight with or without added load, in sets counted in
  reps. Percent-of-1RM, qualitative and range Loads, and timed or distance sets, are ineligible:
  each would need a guess (an estimate, a word, a midpoint) to compare. The two sides are compared
  only within one Load kind, never across absolute and bodyweight (the Load term in the glossary).
  When a pair holds both kinds, each rule is tried in absolute, then bodyweight, before the next
  rule: a shared load in either kind still beats a shared rep count.
- **Bodyweight compares on the added load** (ADR-0026). "Same load" for a weighted pull-up means
  the same added weight the user prescribed; a plain bodyweight set's load is zero added. The
  Performed Body Weight is not part of the comparison, because it changes for reasons that aren't
  training. When both sides recorded one and they differ, the result carries both (`body_weight`:
  `previous_kg`, `latest_kg`, read off the two compared sets), and the story shows them as a
  footnote ("Body weight 80 → 78 kg.") so the comparison stays transparent. They differ at the
  same gram precision loads match at. The copy never shows a bare kg total: "3 more reps at
  bodyweight", "2 more reps at bodyweight + 10 kg", and a shared-rep change names itself as the
  added load ("+2.5 kg added for 5 reps.").
- **The domain returns a structure, never a sentence.** `app/domain/progress_story.py` returns the
  kind (`improved`, `unchanged`, `declined`, `insufficient`), the axis, the held value, both
  measured values and the signed delta, the Load kind, and both Logged Session ids and dates.
  The web view-model (`lib/progress-story-view.ts`) owns the copy, the Weight Unit and the links,
  so every surface words a story identically.
- **Neutral decline wording.** "1 fewer rep at 60 kg than last time." A decline is stated as
  plainly as an improvement, with the same styling: no colour encodes better or worse, because the
  story is a record of what happened, not a verdict on it.
- **A read-time projection** like every other progress figure (ADR-0018): nothing is stored, so
  editing or deleting a Logged Session changes the story on the next read, and a deleted session
  is never linked.

The exercise records response carries the story as `story`, always present for the caller's own
history (`insufficient` when no pair qualifies). The Strength analytics response gains the same
shape from the same domain function.

The first slice (#655) ships the shared-load rule for absolute Loads, pairing the latest session
with the immediately previous one, on the Exercise page. The second (#656) adds the shared-rep
rule and the backwards scan. The third (#657) adds bodyweight with its footnote. The Strength
analytics cards follow in #649's last slice.

## Considered options

- **Fall back to Estimated 1RM when no exact match exists**: rejected. It is the very
  ambiguity the story exists to remove, and it would mix Load kinds the Personal Record keeps
  apart. The Personal Record and Top-Set trend already show the estimate.
- **Compare against the best-ever performance**: rejected. That is a Personal Record; the story
  is about what changed since last time.
- **Compare earliest against latest within a time window (30/90 days)**: rejected. A window is a
  calendar, and training here is self-paced (ADR-0001).
- **Compare the lightest shared load, or the most-repeated one**: rejected. The heaviest is the
  work the user cares most about, and it gives one deterministic answer.
- **Have the API send the sentence**: rejected. Copy, unit and pluralisation are presentation,
  and a pure view-model is unit-testable without a server.
- **Compare bodyweight sets on resolved mass (body weight + added)**: rejected. A lighter body on
  the same added weight would read as a "decline" the user didn't train for.

## Consequences

- **The story can disappear.** Deleting the session behind it falls back to the previous pair, or
  to `insufficient`. That is the cost of never storing it.
- **Many users will see `insufficient` at first.** Anyone who changes every load and every rep
  count between sessions gets no story. The empty state says exactly how to earn one.
- **Duration and distance can join later** on the same "hold one, compare the other" rule; the
  axis field is the extension point.
