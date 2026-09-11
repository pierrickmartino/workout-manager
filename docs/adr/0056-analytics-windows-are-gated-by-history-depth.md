# Analytics windows are gated by History Depth

The Analytics range selector (30D / 90D / 150D) offers a longer window only when the
user's **History Depth** — the span from their earliest Logged Session to now — reaches
past the next-shorter window, because a window whose graph would merely repeat the
shorter one's carries no information ("if the graphs are the same, there is no
interest"). 90D is offered only past 30 days of depth, 150D only past 90; 30D stays the
always-available floor (ADR-0049 fixes it as the floor for the weekly-bar charts).

We measure depth as the **oldest-session age** (a scalar), not a precise per-band "is
there data in the 31–90 / 91–150 band" test. For the case this targets — a new user
whose whole history is recent — the two coincide, and the scalar keeps the selector
**contiguous and monotonic**, which is what makes the disabled-with-hint control
legible ("more history unlocks longer views").

The gate is enforced **server-side**, not just in the toggle UI: an out-of-depth
`?range=` (a bookmark or hand-edited URL) is **clamped** down to the deepest available
window rather than served the redundant graph, and the payload returns the
`available_ranges` set so the served graph and the enabled buttons can never disagree.
History Depth is a read-time projection of the record — free to compute, since the
analytics read model already holds the user's full history in memory.

## Consequences

- A rare **gappy history** (one very old session, otherwise only recent work) can
  unlock a window whose graph is still redundant, because oldest-session age reads as
  deep even when the incremental band is empty. We accept this over a non-contiguous
  selector and the more complex per-band test.
- The Analytics payload gains an `available_ranges` field alongside the served
  (possibly clamped) `range`; the range selector renders unavailable windows as
  disabled with a hint rather than hiding them.
