import "server-only";

import { cache } from "react";
import { auth } from "@clerk/nextjs/server";

// Server-side admin detection. There is one notion of "admin" in the system
// (ADR-0046): the Clerk custom `role` claim equal to `admin`, sourced from the
// user's `public_metadata` and mapped into the session token. The backend gates
// `PUT /api/active-skin` on exactly this claim (`require_admin`); the web layer
// reads the same claim server-side to decide whether to *show* the admin-only Skin
// controls. This is a UI affordance gate only — the real authority is the backend,
// which rejects a non-admin publish regardless of what the UI renders.
//
// `import "server-only"` keeps the claim read out of the browser bundle: admin
// status is never inferred client-side, where it could be spoofed.

// Kept in lockstep with the backend's `admin_role_claim` / `admin_role_value`
// (app/config.py). Should Clerk be configured with a different claim key or value,
// change it in both places.
const ADMIN_ROLE_CLAIM = "role";
const ADMIN_ROLE_VALUE = "admin";

// Whether the current request's user is an admin. Reads the verified session
// claims server-side and fails closed: a signed-out visitor, a missing claim, or
// any transport error yields `false`, so the Skin catalog is shown only on a
// positive `role=admin` match. Wrapped in React `cache` so multiple server
// components in one request share a single resolution.
export const resolveIsAdmin = cache(async (): Promise<boolean> => {
  try {
    const { sessionClaims } = await auth();
    const role = (sessionClaims as Record<string, unknown> | null)?.[
      ADMIN_ROLE_CLAIM
    ];
    return role === ADMIN_ROLE_VALUE;
  } catch {
    // Signed-out or transport failure — not an admin.
    return false;
  }
});
