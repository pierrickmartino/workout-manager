"use server";

import { redirect } from "next/navigation";

import { redeemShare } from "@/lib/sessions";
import { redeemLanding, toRedeemResult } from "@/lib/redeem-share";

export interface RedeemFormState {
  error: string | null;
  // Received-Share safety caveat (ADR-0058, issue #399). When the redeemer has a Sensitive
  // Constraint, the copy is saved but the recipient is held on this page to read the "built for
  // another user" notice prominently — never silently redirected into the plan — with `href`
  // linking to the saved copy so they choose when to open it. `null` for an unflagged redeem.
  caveat?: { message: string; href: string } | null;
}

// Redeem a Share Link into a new standalone Session the recipient owns (Redeem, ADR-0057/0058,
// issues #398/#399). The copy always lands in the recipient's library. For an unflagged redeem we
// redirect straight to the new copy so they land on the plan they can rename, favorite, edit, log,
// and re-share. For a redeemer with a Sensitive Constraint the ADR-0058 caveat is flagged: we hold
// on this page and return the caveat so the button surfaces the "built for another user, not
// tailored to your constraints" notice prominently before they open it — the received Share is
// never auto-promoted into the active flow. On failure — a revoked or unknown link (404) — the
// error is returned for the button to surface. `redirect` throws to navigate, so it runs after the
// write and outside any try/catch.
export async function submitRedeem(
  _prevState: RedeemFormState,
  form: FormData,
): Promise<RedeemFormState> {
  const token = typeof form.get("token") === "string" ? String(form.get("token")) : "";
  if (token === "") {
    return { error: "Could not determine which share link to redeem." };
  }

  const result = toRedeemResult(await redeemShare(token));
  if (!result.ok) {
    return { error: result.error };
  }

  // The hold-vs-redirect decision is the pure `redeemLanding` rule (ADR-0058), keyed on the
  // caveat flag alone so a flagged redeem is never silently redirected into the plan.
  const landing = redeemLanding(result);
  if (landing.kind === "caveat") {
    return { error: null, caveat: { message: landing.message, href: landing.href } };
  }

  redirect(landing.href);
}
