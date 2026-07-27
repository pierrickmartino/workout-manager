# 0035 — The Live Session slot is a non-sensitive, untrusted, unencrypted client store

**Status:** accepted

The Live Session persists to a single plaintext `localStorage` slot (ADR-0012). A
2026 PWA-security review (`docs/research/2026-07-21.md`, finding #1) framed this as
a HIGH confidentiality + integrity surface and suggested encrypting the slot with
the Web Crypto API. We decline slot encryption and instead fix the slot's security
posture with three rules, because the finding's real risk is DOM-XSS, and the slot
is the wrong object to harden against it.

- **The slot carries only non-sensitive workout performance** — the Session's
  prescriptions and the user's own set entries (reps, load, RPE, timestamps). It
  **never** persists PII, credentials, or **Sensitive-Constraint** content (injury,
  rehab, postpartum, medical — `CONTEXT.md`; the class ADR-0003 keeps out of shared
  caches). This is the invariant the other two rules and ADR-0012's client-side
  model rest on.
- **The slot is untrusted input on hydration.** The resume path
  (`readLiveSessionSlot` → `loadLiveSession` → `isLiveSessionState`) structurally
  validates the deserialized shape and treats any mismatch as no slot (start fresh);
  there is no `JSON.parse`-and-trust path. Integrity of what gets *recorded* is
  enforced server-side on finish (Clerk-authorized `POST /api/sessions/{id}/logs`),
  not by the client slot.
- **The slot is deliberately not encrypted.** Under the actual threat — same-origin
  DOM-XSS — any script that can read the slot can also read the decryption key
  (which must live in same-origin JS/IndexedDB) or call `crypto.subtle.decrypt`
  against a non-extractable key handle directly. `localStorage` is already
  same-origin isolated, so there is no cross-origin reader to defend against.
  Encrypting the slot buys ~zero protection against our threat while adding
  key-management complexity and a false sense of safety.

## Considered options

- **Encrypt the slot with Web Crypto (the finding's suggestion).** Rejected as
  security theater against same-origin XSS (above). Reconsider only if the slot ever
  needs to hold data sensitive to a *non-scripted* local reader on a shared device —
  which the non-sensitive invariant above is designed to prevent instead.
- **Do nothing.** Rejected: it leaves "no PII in the slot" as a happy accident rather
  than a rule, and leaves the real DOM-XSS gap unnamed.

## Consequences

- **The real DOM-XSS defense is app-wide, not slot-local.** The finding's severity is
  re-cast onto the absence of a Content-Security-Policy: `apps/web` currently ships
  no CSP or Trusted Types. A nonce-based CSP + `worker-src 'self'` (baseline) and
  Trusted Types (report-only first, given Clerk/Next/React compatibility risk) are
  tracked as a **separate app-wide security issue**, not as part of this slot decision.
- **The hydration guard should become total.** `isLiveSessionState` validates a
  subset of `LiveSet` and no value bounds. A forged slot is already inert as an
  *attack* (React escapes all rendered fields; the server authorizes on finish), so
  completing the guard is a low-priority **correctness** item — but making it a total
  Zod schema (per the repo's TS boundary-validation rule) turns the schema into the
  enforcement point for the non-sensitive invariant: only allow-listed fields survive
  a round-trip.
