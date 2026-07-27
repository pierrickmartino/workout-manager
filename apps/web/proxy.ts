import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  buildContentSecurityPolicy,
  buildTrustedTypesReportOnly,
} from "@/lib/csp";

// Next.js 16 renamed the Middleware file convention from `middleware.ts` to
// `proxy.ts`; a root `middleware.ts` is no longer registered, which left
// `clerkMiddleware()` un-run and made server-side `auth()` calls throw
// "can't detect usage of clerkMiddleware()". `clerkMiddleware` itself is
// unchanged — only the filename moved.
//
// The dashboard, onboarding, and profile editing are authenticated screens;
// everything else (landing, Clerk's own sign-in UI) stays public.
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/onboarding(.*)",
  "/profile(.*)",
]);

// The app-wide DOM-XSS defense (ADR-0036, #257). The `contentSecurityPolicy`
// option makes Clerk emit the enforcing, nonce-based `strict-dynamic` CSP —
// generating the per-request nonce, merging its own required hosts, and passing
// the nonce to `<ClerkProvider dynamic>`. The policy content (our hardening floor
// + `worker-src 'self' blob:` etc.) lives in the pure, tested `lib/csp` builder.
export default clerkMiddleware(
  async (auth, req) => {
    if (isProtectedRoute(req)) {
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
