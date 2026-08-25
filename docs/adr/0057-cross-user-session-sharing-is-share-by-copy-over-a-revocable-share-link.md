# 0057 — Cross-user Session sharing is Share-by-Copy over a revocable Share Link

A user wants to hand one of their saved workouts to another user — "share this
training session with a friend." This is the **first feature in the domain that
crosses the user-ownership boundary**, every prior copy having stayed within one
account (Adopt, Duplicate, Capture). We add **Share / Share Link / Redeem**
(`CONTEXT.md`, §Session Library & Sharing): a user **Shares** a standalone Session
by publishing a **revocable, reusable Share Link**, and the recipient **Redeems**
that link into an **independent deep-copy** they own outright. The sharer's Session
and the recipient's copy are thereafter fully independent. This ADR records why
sharing is *by copy over a link*, not by reference or by a user directory.

**By copy, never by reference — the ownership invariant is non-negotiable.** The
cardinal rule is that *mutating a plan never affects another user* (ADR-0001; every
repository method is scoped to one `clerk_user_id`). A shared *mutable reference*
(one Session, two editors) or a *live read-only cross-user link* (recipient views
the sharer's Session as it changes) would both couple two accounts to one row and
break that invariant the moment either side edits, renames, substitutes, or logs.
Share-by-Copy keeps the guarantee intact: **Redeem** is the cross-user cousin of
**Duplicate** (ADR-0043), reusing its exact deep-copy semantics — Prescriptions,
Supersets, per-set values, **Session Provenance**, and `trace_id` lineage copied
faithfully; **no Logged Sessions** (plan/record split, ADR-0001); lands standalone.
The two deltas from Duplicate are that it crosses users and that it **preserves the
Author** (the original creator) rather than being reborn under the new owner — the
same immutable-origin logic that keeps Provenance from flipping on a copy.

**Over a Share Link, because there is no social graph — and building one is the
wrong first step.** The app has no friends, follows, or user directory; a Profile
is addressable only by an opaque `clerk_user_id`. Addressing a recipient by *email*
or a *people-picker* would require exposing user existence (an enumeration/privacy
hazard) and a consent model — real infrastructure for a v1 convenience. A **Share
Link** needs none of it: the sharer publishes a token, and *the recipient pulls* a
copy by redeeming it. Delivery is therefore a pull (no inbox, no pending-share
state), and the copy is taken from the source Session's state **at redeem time**, so
pre-redeem edits by the sharer flow through.

**Reusable and revocable, not single-use.** Because every Redeem produces an
independent copy, a reusable link ("here is my workout, grab it") is the simpler
mental model and needs no per-recipient token bookkeeping. **Revocation** gives the
sharer an off-switch for *future* Redeems; it deliberately **cannot un-share** copies
already taken — those are independent Sessions the recipients own, and reaching back
into another user's library to delete them would itself violate the ownership
invariant this decision exists to protect. No auto-expiry in v1.

## Considered options

- **Shared mutable reference (one Session, many editors)** — rejected: directly
  violates "mutating a plan never affects other users" (ADR-0001) and forks the
  meaning of every edit, rename, substitution, and log across accounts.
- **Live read-only cross-user link** — rejected: still couples two accounts to one
  row (the recipient's view changes under them as the sharer edits), and offers the
  recipient no owned plan to log, favourite, or re-share.
- **Address recipients by email / in-app user search** — rejected for v1: requires a
  user directory, exposes user existence (enumeration/privacy), and needs a consent
  model — substantial social infrastructure for a feature a link delivers for free.
- **Single-use link** — rejected: more token bookkeeping for a narrower use; a
  reusable+revocable link expresses "a shareable workout" with an off-switch.
- **Revocation deletes copies already redeemed** — rejected: those are independent,
  owned Sessions; deleting them reaches across the ownership boundary this ADR
  protects. Revocation governs future Redeems only.

## Consequences

- **Author diverges from Owner for the first time.** After a Redeem the copy's
  `clerk_user_id` is the recipient while its **Author** stays the original creator,
  preserved through any re-share chain (heavy edits do not re-attribute, mirroring
  Provenance/`trace_id` immutability). Owner and Author were identical on every
  Session until now.
- **Re-sharing is free and unbounded.** A redeemed copy is just a standalone Session
  the recipient owns, so re-sharing it needs no special machinery; the Share Link on
  a copy credits the same original Author.
- **No generation-cache interaction.** Redeem is a no-AI copy of an already-existing
  plan; it touches no generation cache. The **safety** question a shared plan raises
  for a recipient with a Sensitive Constraint is a deliberate carve-out from ADR-0003,
  recorded separately in **ADR-0058**.
- **The library surface is new.** Redeemed and self-authored standalone Sessions are
  reached, searched, and favourited in **My Sessions** (`CONTEXT.md`), a read
  destination off Train that did not exist before this work.
