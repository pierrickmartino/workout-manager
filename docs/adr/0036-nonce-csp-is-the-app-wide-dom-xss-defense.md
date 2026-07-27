# 0036 — A nonce-based strict-dynamic CSP is the app-wide DOM-XSS defense

**Status:** accepted

ADR-0035 re-cast a Live-Session-slot finding onto the real HIGH-severity gap:
`apps/web` shipped **no** Content-Security-Policy, so it had no DOM-XSS
defense-in-depth anywhere — for the Clerk session, the DOM, or the slot alike
(issue #254). We add a **nonce-based, `strict-dynamic`, enforcing CSP** to every
`apps/web` response, plus a report-only Trusted Types probe. The CSP is emitted
by **Clerk's `clerkMiddleware({ contentSecurityPolicy })`**, not hand-rolled.

- **Clerk owns the CSP emission.** Every route already runs through
  `clerkMiddleware` in `proxy.ts` (Next 16's renamed middleware convention).
  Clerk v6's `contentSecurityPolicy` option generates the per-request nonce,
  builds the header merging its own required directives with ours, exposes the
  nonce as `x-nonce`, and passes it to `ClerkProvider` automatically. We do **not**
  hand-plumb a nonce (as issue #254's wording implied) — that would mean owning
  the fragile nonce/Clerk/Next-hydration seam and hardcoding Clerk's script/connect
  origins, which then rot on every Clerk upgrade. The issue's "plumb a per-request
  nonce through middleware" is satisfied *by* Clerk's middleware.
- **`strict: true` → `script-src 'nonce-…' 'strict-dynamic'`.** The nonce
  transitively trusts scripts that trusted scripts inject, so we carry **no script
  host allowlist** and no `'unsafe-inline'` in `script-src`. It requires
  `<ClerkProvider dynamic>`, which opts the tree into dynamic rendering — but under
  ADR-0022/0028 every authenticated navigation is already `cache: "no-store"` and
  server-rendered per request, so there is almost no static-generation benefit to
  lose. The near-free cost buys the genuinely strict form.
- **`worker-src 'self' blob:` — a deliberate divergence from issue #254's
  `'self'`.** Clerk instantiates web workers from `blob:` URLs, so bare `'self'`
  breaks it. `blob:` widens only *Worker instantiation* (same-origin, script-created,
  XSS-gated). It does **not** re-open cross-origin **service-worker registration**:
  `navigator.serviceWorker.register('https://evil…/sw.js')` stays blocked by `'self'`,
  so the ADR-0028 bound the issue actually wanted (no foreign SW hijacking
  navigations) is fully intact. `public/sw.js` still registers.
- **`style-src 'self' 'unsafe-inline'` is an accepted, bounded concession.** The
  acceptance criteria forbid `'unsafe-inline'` only in `script-src`. `next/font`,
  Tailwind v4 + Next RSC, and Clerk's components all inject inline styles, and Next
  does not nonce every style path. With a strict `script-src` (and, eventually,
  Trusted Types) in place, inline styles cannot execute script, so this is a marginal
  vector. Do not "fix" it to nonce-only — it will break fonts.
- **Hardening floor we own:** `default-src 'self'`, `object-src 'none'`,
  `base-uri 'self'` (blocks an injected `<base>` rewriting relative URLs — a real
  strict-CSP bypass), `frame-ancestors 'none'` (clickjacking; the app is never
  embedded), `form-action`, and `img-src 'self' https://img.clerk.com data:`. Clerk's
  option owns the Clerk-specific `script-src`/`connect-src`/`frame-src`/`worker-src`
  hosts (its FAPI, `https://challenges.cloudflare.com` for Turnstile).
- **The directive set is a pure, tested value.** Directive assembly lives in
  `lib/csp.ts` with a co-located `lib/csp.test.ts` (per the repo's "logic in `lib/`,
  thin boundary" rule); `proxy.ts` is thin wiring. The tests turn the acceptance
  criteria into regressions: no `'unsafe-inline'` in `script-src`, `object-src 'none'`,
  `worker-src` carries both `'self'` and `blob:`, `frame-ancestors 'none'`.

## Considered options

- **Hand-roll the nonce in `proxy.ts` and thread it into the layout/`ClerkProvider`
  (issue #254's literal framing).** Rejected: Clerk v6 already does exactly this, and
  hand-rolling means owning the hydration seam and a hardcoded, rot-prone list of
  Clerk's own script/connect origins.
- **Plain nonce + explicit script host allowlist (no `strict-dynamic`).** Rejected:
  keeps public routes statically renderable, but the allowlist is precisely the
  "guessing at Clerk's directives" the issue warned against and breaks whenever Clerk
  adds a script origin. The app's already-dynamic authed rendering makes the
  `strict-dynamic` cost negligible.
- **`worker-src 'self'` verbatim.** Rejected: breaks Clerk's `blob:` workers, and the
  SW-hijack bound it was meant to protect survives `blob:` anyway.

## Consequences

- **Trusted Types ships report-only, enforcement deferred pending evidence.**
  `require-trusted-types-for 'script'` goes out in `Content-Security-Policy-Report-Only`
  alongside the enforcing CSP (a second, non-enforcing header — zero user risk).
  Violations are captured **manually** via DevTools across the core flows (sign-in
  modal, dashboard hydration, live session, builder DnD) — there is no
  violation-collector endpoint, and standing one up is a separate ticket. React 19 +
  Clerk's injected scripts are the expected blocker; the observed violation list and
  the enforce/defer call are recorded on issue #254. Enforce only after a clean
  report-only run.
- **CSP correctness is coupled to Clerk's middleware.** If auth ever moves off Clerk,
  the CSP emission moves with it; the owned hardening floor in `lib/csp.ts` is
  portable, the Clerk-specific hosts are not.
- **Sign-out cache purge (ADR-0028) is still not triggered.** This CSP work adds no
  authenticated caching; that precondition remains dormant.
- **The `isLiveSessionState` → total-Zod-schema item (ADR-0035) is still separate.**
  It is a low-priority correctness follow-up, untouched here.
