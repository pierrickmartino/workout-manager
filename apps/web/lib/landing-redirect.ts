import "server-only";

import { auth } from "@clerk/nextjs/server";

// The landing route (`/`) is the signed-out welcome + sign-in surface. A
// returning, authenticated visitor has no use for it: an installed-app cold
// launch should land one tap from the next Live session, not on a welcome screen
// (docs/design/navigation-review.md finding #2). This seam resolves where such a
// visitor belongs — `/dashboard` when signed in, `null` (stay on `/`) when not.
// The profile-completeness gate is deliberately NOT duplicated here: it stays
// solely in `/dashboard`, which forwards new users to `/onboarding`
// (app/dashboard/page.tsx). This only splits signed-in from signed-out.
//
// It returns the target rather than calling `next/navigation`'s `redirect()` so
// the routing decision is unit-testable without a browser (per the frontend
// convention in CLAUDE.md); the thin page performs the redirect.
export async function resolveLandingRedirect(): Promise<string | null> {
  try {
    const { userId } = await auth();
    return userId ? "/dashboard" : null;
  } catch {
    // An auth/transport failure fails closed to "signed-out": render the
    // welcome surface rather than bouncing. Same posture as resolveIsAdmin.
    return null;
  }
}
