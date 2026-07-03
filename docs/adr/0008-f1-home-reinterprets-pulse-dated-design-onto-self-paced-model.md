# 0008 — F1 Home reinterprets Pulse's dated design onto the self-paced model

The Pulse design variant draws the Home screen around a **dated week** — a
"today's" session, a Monday–Sunday cycle strip, a queue of dated upcoming
sessions, and an "87% READY" score. ADR-0001 commits v1 to **self-paced,
calendar-free** Protocols (Week/Day are descriptive labels, not date
commitments). Rather than introduce scheduling — and with it missed-session
reconciliation and calendar reshuffling — every Home widget is **reinterpreted
onto the existing model, using only data we can honestly back**. No calendar is
added.

Concretely:

- **Current Protocol, not "today".** Home works off the user's Current Protocol
  (the most recently adopted Protocol still holding an un-performed Session) and
  surfaces its **Next Session** — the next un-performed one in sequence. There is
  no dated "today's session". When no Current Protocol exists, Home falls back to
  the generate-training CTA.
- **Readiness is a state, not a percentage.** A three-tier badge — Extra Caution
  (a Sensitive Constraint) → Caution (a Preference / Limitation, or a most-recent
  Logged Session whose mean perceived difficulty exceeds the hard threshold) →
  Ready. A recovery *percentage* is deliberately not shown: with no plan calendar
  there is no honest "time since last workout" basis for one.
- **The week strip shows position, not weekdays.** Dots represent the Sessions of
  the Current Protocol's current week (done / active / upcoming), with a
  week-of-total overline — not Monday–Sunday day dots.
- **The queue carries no per-session percentages.** It lists upcoming
  un-performed Sessions (position, module count, duration); completion is binary
  per Session, so the only honest aggregate — protocol completion `X / N` — is
  shown once as a header, never as a per-row ring.
- **No fabricated hero metrics.** Hero stats are duration, module count, and set
  count — all derivable from the prescriptions. Target calories are dropped (no
  backing data) and single-number tonnage is dropped (free-text loads would
  silently exclude bodyweight and %-based work, misleading the user).

The `INITIATE SESSION` hero action routes to the Next Session's existing
detail/log page; a genuine live-session mode is deferred to F2.

## Consequences

- Home needs one new read endpoint (`GET /api/protocols/current`) so the Current
  Protocol selection rule lives server-side; no schema change and no new
  capability.
- The screen matches Pulse's *layout and feel* but intentionally diverges from
  its *dated semantics*. A future reader comparing the two should treat the
  divergence as deliberate, not an incomplete port.
- Calendar binding, a computed readiness score, per-session progress, and a live
  session can each layer on later without reworking this reinterpretation.
