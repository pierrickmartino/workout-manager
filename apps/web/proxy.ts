import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

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

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next internals and static files, run on everything else.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
