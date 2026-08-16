# 0049 — Weekly Distance: the endurance projection over `distance` sets

ADR-0032 typed the amount axis of a set (`Quantity`) so a run could finally be
*recorded*, and noted that a running Personal Record was now *derivable* but
deliberately unbuilt. This ADR builds the first endurance analytic on that
foundation: **`Distance` — the total kilometres the user covered, summed from
`distance`-kind Quantities and bucketed by week** — and realigns the Analytics
range toggle from `7/30/90` days to `30/90/150` to give a weekly chart room to
breathe.

The motivating observation from a running user: kilometres do not belong in the
Total Volume chart, and the existing 7-day floor is too short for a weekly view.
Both are right, and both fall out of what the model already says.

**`Distance` is a read-time projection, the endurance twin of Volume.** Where
`domain/volume.py` sums convertible kg tonnage, `domain/distance.py` sums the
metres of every Logged Set whose `Quantity.kind` is `distance`, bucketed by the
shared Monday week-start (`domain/week.py`) the Streak and Muscle-Group balance
already use. It is computed from the *record* at read time with no stored ledger,
the same posture as XP, Streak, and Personal Records (ADR-0018/0019). The feed is
keyed off the **typed Quantity kind**, not a training-type label — the structural
signal, exactly as Volume keys off `Load.kind` — so it needs no fragile string
match and captures every distance-logged set.

**Runs never polluted the Volume chart to begin with.** A `distance` Quantity has
no rep count, so `set_volume` already returns `None` and the set falls out of both
the tonnage line and its coverage denominator (ADR-0032). So this change is purely
**additive**: it adds the missing endurance surface rather than removing runs from
Volume. Runs also stay counted in the type-neutral SESSIONS / ACTIVE DAYS /
TOTAL SETS tiles, consistent with XP's training-type neutrality — carving running
out of those would fight that principle.

**No coverage caveat, and no duration-only footnote.** A `distance` Quantity
carries exact metres, so — unlike tonnage, where bodyweight and %-1RM sets sit in
an uncovered remainder — every distance set contributes fully and coverage is
structurally 100%. We considered disclosing runs *logged by time alone* (a
`duration` Quantity with no distance), but a `duration` set is indistinguishable
from a plank or a yoga hold without an activity taxonomy the domain does not have.
A footnote reading "N runs logged by time only" would miscount timed non-running
work as runs — a dishonest disclosure — so it is **omitted**. The chart carries
only the equal-window **delta**, reusing Volume's preceding-equal-window logic.

**The range toggle realigns to `30/90/150` globally.** Weekly bars need several
weeks to read as a trend; a 7-day window is a single bar. Rather than give the new
chart a second, private selector, the one screen-wide toggle moves to
`30/90/150` — dropping the 7-day view for *every* metric (counts, muscle split,
and the daily Volume line). Old `?range=7d` links fall back to the new default
(`30d`) through the existing `toAnalyticsRange` narrowing, so no link breaks.

## Considered options

- **Fold distance into the Volume chart** — rejected: Volume is kg tonnage by
  definition (CONTEXT 'Volume' / 'Quantity'), and a kilometre is not a kilogram.
  Mixing axes on one line destroys both.
- **Key the feed off a "running" training-type label** — rejected: training type
  is free text, and a label match is fragile where the typed `distance` Quantity is
  a structural fact. It would also miss a distance set logged under any other type.
- **Give the distance chart its own 30/90/150 selector, leaving the global toggle
  at 7/30/90** — rejected: two selectors on one screen is a worse experience than
  one consistent window, and the weekly chart forces a ≥30-day floor regardless.
  The cost — losing the 7-day snapshot for Volume and the counts — is accepted.
- **Split distance per activity (running / cycling / rowing)** — deferred: there is
  no activity dimension on a set beyond the referenced Exercise and the free-text
  training type. A real breakdown needs an **activity taxonomy**, a separate and
  larger design. v1 sums all distance work into one combined weekly total.

## Consequences

- A pure strength user never sees the chart: it is gated on the presence of **any**
  `distance` Logged Set in all-time history (`has_distance`), mirroring how Strength
  Analytics gates on `has_qualifying_strength`. A runner who did not run inside the
  selected window still sees the (possibly empty) card, because they *are* a runner.
- **Combined-total distortion for multi-modal users:** a user who both runs and
  cycles sees cycling kilometres dominate the same total, and a pool swim's metres
  fold in. This is the known cost of deferring the activity split — disclosed here,
  resolved by a future activity taxonomy, not by this ADR.
- Distance is exact, so `distance_series` carries a **delta but no coverage figure**
  — a deliberately smaller read model than `volume_series`, not an oversight.
- The realignment drops `7d` from every Analytics metric. This is a UX trade the
  weekly chart forces; it is reversible (a schema-free enum change) if the short
  window proves missed.
