import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  buildContentSecurityPolicy,
  buildTrustedTypesReportOnly,
} from "@/lib/csp";
import { isPublicRoute } from "@/lib/route-access";

// Next.js 16 renamed the Middleware file convention from `middleware.ts` to
// `proxy.ts`; a root `middleware.ts` is no longer registered, which left
// `clerkMiddleware()` un-run and made server-side `auth()` calls throw
// "can't detect usage of clerkMiddleware()". `clerkMiddleware` itself is
// unchanged — only the filename moved.
//
// Authentication is **fail-closed** (finding #9): every route is protected unless it
// is on the public allowlist in `lib/route-access`. This replaced a short denylist
// (`/dashboard`, `/onboarding`, `/profile` only) under which ~9 private route
// families — protocols, sessions, history, exercises, train, metrics, analytics,
// logs, admin — silently rendered for signed-out visitors, who then hit a load
// error, an empty hub, or a not-found screen instead of a deliberate sign-in. A
// signed-out visitor to a private route is now redirected to `/sign-in` with the
// deep link preserved as `?redirect_url=…`, which Clerk returns them to after
// sign-in (see app/sign-in). Admin stays private here; its role gate (resolveIsAdmin
// → notFound for a signed-in non-admin) is unchanged and independent (ADR-0046).

// The app-wide DOM-XSS defense (ADR-0036, #257). The `contentSecurityPolicy`
// option makes Clerk emit the enforcing, nonce-based `strict-dynamic` CSP —
// generating the per-request nonce, merging its own required hosts, and passing
// the nonce to `<ClerkProvider dynamic>`. The policy content (our hardening floor
// + `worker-src 'self' blob:` etc.) lives in the pure, tested `lib/csp` builder.
export default clerkMiddleware(
  async (auth, req) => {
    if (!isPublicRoute(req.nextUrl.pathname)) {
      await auth.protect();
    }
    // Trusted Types ships report-only first (React 19 + Clerk are the expected
    // blockers). This is a second, non-enforcing header alongside Clerk's
    // enforcing CSP — observed, not enforced, until a clean run (ADR-0036).
    const response = NextResponse.next();
    response.headers.set(
      "Content-Security-Policy-Report-Only",
      buildTrustedTypesReportOnly(),
    );
    return response;
  },
  { contentSecurityPolicy: buildContentSecurityPolicy() },
);

export const config = {
  matcher: [
    // Skip Next internals and static files, run on everything else.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
