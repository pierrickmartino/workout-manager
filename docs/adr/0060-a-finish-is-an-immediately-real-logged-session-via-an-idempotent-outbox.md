# 0060 — A finish is an immediately-real Logged Session, delivered through an idempotent outbox

**Status:** accepted

Finishing a **Live Session** must produce **exactly one** **Logged Session** under the
correct account even if the network drops mid-write, the app is closed and reopened, or
the write is retried. Today it does neither reliably: `handleFinish`
(`apps/web/components/LiveSessionScreen.tsx`) **clears the slot before** the
`POST /api/sessions/{id}/logs` and only restores it on an error it actually receives,
and the endpoint (`apps/api/app/routes/logs.py`) mints ids by DB auto-increment with
**no idempotency** — so a dropped connection that already committed server-side, or any
retry, silently duplicates a record. We fix this by settling *what a finish is* and
*how it is delivered*.

- **A finish creates a real Logged Session at the moment the user finishes**, identified
  by a **client-minted key** (a UUID). "Finishes" in the **Live Session** →
  **Logged Session** transition (ADR-0012, CONTEXT.md) means the tap, not the server
  acknowledgement: the record is real the instant it is authored; only its *delivery* is
  in flight. Sync is therefore a **transport** concern, kept out of the domain and out of
  `CONTEXT.md` — there is no "pending" Logged-Session state and no stored `status` (which
  the read-time-projection rule, ADR-0018, forbids anyway).
- **Finished records queue in an IndexedDB outbox**, not the `localStorage` live slot.
  Each entry carries its finish payload, its idempotency key, and its owner's account id
  (ADR-0059). The queue retries on the `online` event and on foreground; a visible manual
  retry always exists, because Background Sync is unavailable on Safari/iOS.
- **The client-minted key is the server-side dedupe identity.** The `LoggedSession`
  table keeps its `int` primary key and gains a **nullable-unique `idempotency_key`
  column**. `create` becomes upsert-return: a key already present returns the existing
  row as success; otherwise it inserts. The client resends the **same** key on every
  retry. The contract covers both `POST /api/sessions/{id}/logs` and the ad-hoc
  `POST /api/logs` (ADR-0031), and thus the idle-auto-end and end-blocking-session writes
  that share the client `record()` path.
- **The one-Live-Session invariant governs the live performance only.** A finished record
  is no longer *live*, so the user may start their **next** Session immediately while
  earlier finishes are still queued: the outbox holds **multiple** records. Out-of-order
  delivery is safe — Protocol advancement and every gamification figure are **read-time
  projections** keyed on each record's own `performed_on`, not on sync-arrival order.

## Considered options

- **Treat a finish as a pre-record that becomes a Logged Session only on server ack
  (rejected).** Introduces a genuinely new domain entity — a "pending finish" that is not
  yet a record — fracturing the clean `Live Session → Logged Session` boundary and
  forcing sync into the ubiquitous language. Making the record real at finish keeps the
  domain honest ("what the user did") and confines sync to transport.
- **Make the client UUID the primary key (rejected).** Aligns identity with the
  idempotency key, but ripples across every `LoggedSession.id: int` reference in models,
  repositories, routes, and the web wire types — large blast radius for no gain over a
  unique secondary column.
- **Block a new Live Session until the outbox drains (rejected).** Preserves "one session"
  most literally, but strands a user who reconnects to nothing and wants to train again;
  the invariant was never about *delivery*.
- **Server-generated idempotency via a natural key** (user + session + performed_on).
  Rejected: legitimately distinct performances can share those fields (two runs of the
  same Session on one day), so a natural key would collapse real records. An explicit
  client key separates "the same finish, retried" from "a different finish."

## Consequences

- **Retries are safe and observable.** Because the key is stable per finish and the write
  is upsert-return, the client can retry freely; a 2xx means "this exact finish is
  recorded," first time or nth.
- **Requires an Alembic migration** adding `idempotency_key` (nullable, unique). Pre-existing
  rows carry `NULL`; uniqueness must permit multiple `NULL`s (Postgres does) so historical
  records are untouched.
- **The outbox is user-scoped and torn down on sign-out (ADR-0059).** A queued finish is
  local durability, not a server promise — the UI must say so ("Saved on this device; keep
  the app installed until sync completes") rather than imply a completed sync.
- **Projections lag delivery, deliberately (ADR-0061).** Until a queued record syncs, the
  server cannot see it, so XP / PRs / Streak do not yet reflect it; the sync-state UI, not a
  second client-side projection engine, carries that truth.
