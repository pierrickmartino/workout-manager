# 0030 — Selecting the Current Protocol reads the Logged history once

The read-model layer is split into two tiers: a **pure projection** tier that computes
over an already-loaded Logged history and does no I/O (`project_gamification`,
`evaluate_achievements`, `logged_set_records`, `set_records`), and a **service** tier that
reads the history once and fans it out (`profile_progress`). ADR-0018 leans on this: Home
projects XP, Streak and the Latest PR from the *one* history it reads for Readiness — "zero
extra I/O." This ADR extends that convention to the Protocol path, which had quietly opted
out of it.

**The regression was a K+1 on the hottest endpoint.** `current_protocol` selects the
user's most-recently-adopted Protocol that still holds an un-performed Session by iterating
their Protocols and asking each whether it has a Next Session. It did that by calling the
`progressed_protocol` **service** in the loop — and that service reads the entire Logged
history every call. So selecting the Current Protocol read the whole history once per
Protocol scanned, and `GET /api/home` — which had *already* read the history for Readiness,
gamification and the Latest PR — threw that copy away and re-read it 1..K more times. A user
whose Protocols are all complete pays K = all of them. Each read is itself a per-row
fan-out in the SQL adapter, so the cost compounds.

**The fix is placement, not new machinery.** `progressed_protocol` and `protocol_progress`
gain pure cores — `progressed_protocol_from(protocol, logged_sessions)` and
`protocol_progress_from(protocol, logged_sessions)` — that take a resolved Protocol and an
already-loaded history and compute the view with no I/O. The existing functions keep their
signatures and become thin **services**: resolve ownership, read the history once, delegate.
`current_protocol` stops calling the service in a loop; it projects each candidate Protocol
through the pure core over **one** shared history. It now receives that history as a
parameter, so Home hands down the copy it already holds and the whole request makes a single
history read — the "zero extra I/O" ADR-0018 already claimed for gamification, now true for
the Protocol path too.

This also removes a second redundancy the loop hid: `protocols.list_for_user` already
returns full `ProtocolView`s with their Sessions, so the old inner `progressed_protocol`
re-fetched via `protocols.get` a Protocol the loop already held. The pure core takes the
`ProtocolView` in hand, so that per-iteration `get` is gone as well.

**Enforcement is a read-counting test, because the suite could not see the K+1.** Every
endpoint test injects the in-memory repository, and no test counted queries, so the
re-reads were structurally invisible — the same blind spot ADR-0029 called out. A
`_CountingLoggedRepository` wraps the injected repo and tallies `list_for_user`; a Home test
gives a user three finished Protocols behind one in-progress (so selection must scan past
all three) and asserts the request reads the history **exactly once**. Reverting
`current_protocol` to the loop-of-services makes that test read five times and fail, so the
guard genuinely trips. The pure cores are also tested directly with hand-passed data,
demonstrating the projection tier needs no repository to exercise.

## Scope

This ADR covers **only** the request-level convention: who reads and who receives. Two
adjacent inefficiencies the exploration surfaced are deliberately **out of scope**, each its
own seam:

- **The per-read N+1 inside `SqlLoggedSessionRepository.list_for_user`** — one sets-query
  per session plus a `get(Exercise)` per set, with no eager loading. It lives entirely
  behind the `list_for_user` interface, touches only the SQL adapter, and no current test
  can observe it; fixing it well wants a query-counting test against the SQL repository.
- **The quadratic `achievements._unlocked_on` replay** — a distinct in-process (CPU, not
  I/O) algorithmic seam.

Folding either into this change would blur two unrelated seams. They are recorded here as
known follow-ups, not silently bundled.

## Considered options

- **Give `current_protocol` its own single internal read** (keep it taking the `logged`
  repo, read once inside, loop the pure core) — rejected as half a fix. It kills the K+1 but
  leaves Home at two reads (its own plus `current_protocol`'s), so the endpoint still
  re-reads a history it already holds. Threading the history the last step realizes the
  convention fully for one parameter of churn.
- **A `LoggedHistory` value object** wrapping the list and memoizing the repeated walks
  (latest-sets-by-exercise, advancing-session ids) — rejected here under YAGNI. It is a new
  domain noun needing a CONTEXT.md entry and overlaps the "many set-walks" concern of a
  separate candidate; the established convention threads the raw `list[LoggedSessionView]`
  (as `project_gamification` and `evaluate_achievements` already do), and this change stays
  consistent with it.
- **Collapse the service wrappers and resolve in each route** — rejected: it sprays the
  "resolve owned Protocol → 404 → read history" triplet across four routes and their tests,
  fattening the routes (a separate architectural concern) for no gain. The wrappers
  concentrate that I/O and, by the deletion test, earn their keep across their callers.

## Consequences

- `GET /api/home` reads the Logged history once per request instead of 1..K+1 times; the
  saving grows with how many Protocols a user owns.
- The Protocol read model now matches the rest of the read-model layer: pure projections
  take history, services read once and delegate. A future reader finds one convention, not
  two.
- The read-counting test doubles as a standing guard: any future caller that re-introduces a
  per-Protocol history read fails it.
