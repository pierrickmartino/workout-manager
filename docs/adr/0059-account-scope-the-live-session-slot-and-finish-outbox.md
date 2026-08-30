# 0059 — Account-scope the Live Session slot and the finish outbox

**Status:** accepted

The **Live Session** persists to a single origin-wide `localStorage` slot,
`workout-manager.live-session` (`apps/web/lib/live-session-storage.ts`), keyed by
nothing but the origin and **not purged on sign-out** (`sign-out-row.tsx` calls
`signOut()` only). On a shared browser profile, account A's in-flight slot is offered
as a **resume** affordance to account B — the practical shared-device boundary the
market report (`docs/research/workout-manager-market-ux-pwa-report.md`, P0 #1) flags.
The same boundary now governs the **finish outbox** ADR-0060 introduces. We
**scope both stores to the authenticated account** and purge them on sign-out.

- **The slot payload carries the owner's Clerk account id, and hydration rejects a
  mismatch.** `LiveSessionState` gains an `accountId`; the resume path
  (`readLiveSessionSlot` → `loadLiveSession` → `isLiveSessionState`) treats a slot
  whose `accountId` ≠ the current Clerk user as **no slot** and **purges it**, exactly
  as it already treats a structurally invalid slot (start fresh). The client reads the
  id via Clerk `useUser()`/`useAuth()` — available today but unused in
  `LiveSessionScreen.tsx` and `resume-session-banner.tsx`.
- **The finish outbox (IndexedDB, ADR-0060) shares the boundary.** Every queued record
  carries its owner's `accountId`; entries whose id ≠ the current user are never read
  and are purged.
- **Sign-out purges all user-scoped local state.** Before `signOut()`, the client
  clears the live slot, the outbox, and any user-specific caches. A signed-out reader
  never inherits the prior account's local state.
- **An abandoned slot is surfaced, not silently discarded.** The resume affordance shows
  the Session's start date/time; there is **no** client-side hard expiry in v1. This is
  distinct from ADR-0014's server-side idle auto-end, which ends a *live performance*
  after inactivity — a stale `localStorage` slot is a different object.

This **amends ADR-0035** (the slot's security posture). ADR-0035's non-sensitive /
untrusted-on-hydration / unencrypted rules all stand; account-scoping adds a fourth
rule — an ownership boundary — that ADR-0035 did not address. The slot stays plaintext
and non-sensitive; the boundary is about *cross-account mix-up*, not confidentiality.

## Considered options

- **Namespace the storage key per user** (`workout-manager.live-session.<userId>`)
  instead of embedding the id. Rejected: cleaner isolation, but a signed-out or
  switched account leaves the prior user's slot **orphaned** under its own key until an
  unrelated purge runs, and it multiplies keys the resume banner must scan. Embedding
  the id in a single slot lets hydration *actively purge* a foreign slot on sight.
- **Encrypt the slot per account.** Rejected for the same reason ADR-0035 declined
  encryption: the threat here is a same-origin cross-account *mix-up*, not a
  cross-origin reader, and a key that lives in same-origin JS defends against neither.
  Partitioning and sign-out lifecycle solve the actual problem.
- **Do nothing / rely on the existing hydration guard.** Rejected: the structural guard
  accepts any well-shaped slot regardless of owner, so it cannot tell account B's valid
  slot from account A's.

## Consequences

- **The hydration guard becomes the enforcement point for ownership.** `isLiveSessionState`
  (ideally the total Zod schema ADR-0035 anticipated) must require `accountId` and the
  resume path must compare it to the live Clerk identity — an unauthenticated read (no
  current user) yields no resume.
- **Legacy slots without an `accountId` are treated as foreign and purged.** A slot
  written before this change carries no id; rather than guess an owner, hydration
  discards it (start fresh). One-time loss of a mid-session resume for slots straddling
  the upgrade is acceptable versus mis-attributing one.
- **Sign-out gains a real teardown step.** `sign-out-row.tsx` grows a pre-`signOut()`
  purge; its correctness (does it clear *every* user-scoped store) becomes a test target
  as new local stores are added.
