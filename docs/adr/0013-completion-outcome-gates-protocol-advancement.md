# 0013 — Completion Outcome gates Protocol advancement

**Status:** proposed

ADR-0001 made "next" the first un-performed Session, and the code (`app/protocols/progress.py`) counts a Session performed the moment **any** Logged Session references it. F2 needs a partial workout *not* to advance the plan. So a Logged Session now carries a **Completion Outcome** — **Completed** (every prescribed set was attempted, regardless of reps or load achieved) or **Incomplete** (some prescribed set was left un-attempted). Protocol advancement keys off a *Completed* log, not any log: an Incomplete performance leaves that Session as the Next Session, to be retried by running the whole Session again. This **amends ADR-0001's advancement rule**.

## Considered options

- **Server-derived outcome** (count logged sets against the prescription) was rejected: a server can only see *logged* sets, so it would mark Incomplete a user who did all three sets but logged one through the quick form — punishing honest under-logging. The outcome is therefore **client-declared** on the log POST, the first domain verdict the client asserts rather than the server deriving. This is consistent with the app already trusting self-reported reps, load, and RPE.
- **"Failed" as the domain term** was rejected for collision: "training to failure" is maximum effort (a *good* thing), so "Failed Session" is ambiguous. The domain term is Completed/Incomplete; UI may still label the Incomplete state "FAILED · RETRY".

## Consequences

- All-or-nothing retry: skip one module of seven and the whole Session must be re-run. The completed sets stay in history as real volume and PRs — they just don't advance the Protocol.
- Reps missed, or a set ground to zero to failure, never make a Session Incomplete; only *un-attempted* prescribed work does.
- The set-based progress bar (`% complete`) reaches 100% exactly when the session becomes Completed — the bar *is* the completion criterion.
