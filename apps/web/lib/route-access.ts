// The public-route allowlist — the one place that decides which paths a signed-out
// visitor may reach (finding #9). Everything not named here is private and gated by
// `auth.protect()` in `proxy.ts`, so the app is **fail-closed**: a new route is
// private by default and only becomes public by being added below. That inverts the
// old denylist, where a new private area leaked until someone remembered to protect
// it — which is how ~9 route families (protocols, sessions, history, exercises,
// train, metrics, analytics, logs, admin) ended up ungated.
//
// Pure and dependency-free (no Clerk, no `next/*`), so the decision is unit-testable
// without a browser or a request — the frontend convention in CLAUDE.md ("logic
// lives in lib/ so it's trivially testable"), matching how `lib/csp` and
// `lib/back-target` were extracted from their consumers. `proxy.ts` stays a thin
// caller of `isPublicRoute`.

// Paths that are public only as an exact match — no sub-paths.
//   `/`        — the signed-out welcome + sign-in surface (a signed-in visitor is
//                bounced to /dashboard by resolveLandingRedirect, not by auth).
//   `/offline` — the PWA offline fallback (ADR-0028): precached, fetches no data,
//                needs no JWT, and must render from cache with no network.
const PUBLIC_EXACT_PATHS: ReadonlySet<string> = new Set(["/", "/offline"]);

// Path prefixes that are public together with everything beneath them. Clerk's
// sign-in / sign-up components are catch-all routes ("/sign-in/factor-one",
// "/sign-up/verify-email-address", the SSO callback), so the whole subtree is public
// — that is where `auth.protect()` sends an unauthenticated deep-linker, and gating
// it would be a redirect loop.
// PROTOTYPE (throwaway): `/prototype/*` hosts mock-data UI prototypes that need no auth —
// public so they run from a bare `npm run dev`. Remove this entry when the prototype folders
// (`app/prototype/`, `components/prototype/`) are deleted.
const PUBLIC_PATH_PREFIXES: readonly string[] = ["/sign-in", "/sign-up", "/prototype"];

// Whether a signed-out visitor may reach this path without being redirected to
// sign-in. Compared against the request pathname only (no query/hash). Anything not
// matched is private — the fail-closed default.
export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_EXACT_PATHS.has(pathname)) return true;
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
