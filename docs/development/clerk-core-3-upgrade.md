# Clerk Core 3 upgrade (`@clerk/nextjs` 6.39.7 → 7.9.11)

Core 2 is in LTS (critical fixes only) until about March 2027. TASKS §4 asked for two things
with this bump: the control-component migration, and an audit of every `apiGet` / `apiSend`
catch path, because Core 3's `getToken()` throws `ClerkOfflineError` when offline.
Checked on 2026-10-07.

## What broke

`<SignedIn>`, `<SignedOut>` and `<Protect>` are gone. `@clerk/nextjs` 7 still exports the three
names as stubs that **throw when rendered**, so `tsc` and the unit suite pass, and the root
layout throws on every page at run time.

- `app/layout.tsx` (four blocks) and `app/page.tsx` (one) now use `<Show when="signed-in">` /
  `<Show when="signed-out">`.
- `lib/clerk-import-policy.ts` fails `npm test` when a component or page imports a removed
  name, so a copy-pasted Core 2 snippet can't ship.

Nothing else needed a change: `clerkMiddleware({ contentSecurityPolicy })`, `auth.protect()`,
`<ClerkProvider dynamic>`, `<SignInButton>`, `<SignIn>` / `<SignUp>`, `useAuth()` and
`useClerk()` keep their Core 2 shapes.

## The `getToken()` audit

**Our transport cannot raise `ClerkOfflineError`.**

- `getToken()` is called in one place: `authHeaders()` in `lib/api.ts`, through
  `auth()` from `@clerk/nextjs/server`. It runs in Server Components and Server Actions only
  (`import "server-only"`).
- On the server, `@clerk/backend`'s `createGetToken` returns the request's session token, or
  `null` when there is no session. It only fetches when a JWT `template` or
  `expiresInSeconds` is passed, and we pass neither. The offline throw belongs to the
  **browser** session's `getToken()` (`@clerk/shared` `session.d.ts`), which no file calls.
- The `null` case still raises our own `MissingAuthError`, as before.
- None of the 24 modules that call `apiGet` / `apiSend` / `apiUpload` / `apiGetRaw` catches a
  Clerk error class, so no catch path depends on Clerk's error types.
- The client consumers of `useAuth()` (`OutboxSyncRegistrar`, `use-sync-status`,
  `use-form-draft`, the Live Session and log forms) read only `userId` and `isLoaded`, and act
  only when both are set. They never call `getToken()`.

An offline client therefore fails where it always did: when the Server Action request itself
can't leave the device. That is the finish outbox's (ADR-0059/0060) and the Calibration
catch path's concern (TASKS §2), not Clerk's.

## Run-time comparison

Run with `next build && next start`, Core 2 and Core 3 side by side, using the Lighthouse
placeholder keys:

| Check | Core 2 (6.39.7) | Core 3 (7.9.11) |
| --- | --- | --- |
| `/`, `/sign-in`, `/sign-up` | 200 | 200, landing CTA rendered |
| `/dashboard`, `/train` signed out | 307 → sign-in `?redirect_url=…` | identical |
| Our CSP floor (`lib/csp.ts`) | present | identical |
| Report-only Trusted Types header | present | identical |

The only header difference is Clerk-owned (ADR-0036 leaves those hosts to Clerk): Core 3
adds `https://*.protect.clerk.com`, its bot protection, to `script-src`, `connect-src` and
`frame-src`, and drops `https://images.clerkstage.dev` from `connect-src`. `'unsafe-inline'`
in `script-src` was already there in Core 2. Clerk adds it as a CSP2 fallback, and CSP3
browsers ignore it next to a nonce and `'strict-dynamic'`.

## Not verified here

- A real sign-in, session refresh and sign-out against a live Clerk instance. The placeholder
  key renders public pages only.
- An installed-PWA offline cold start: whether `useAuth()` reaches `isLoaded` without the
  network under Core 3. Add it to the PWA recovery matrix (TASKS §2).
