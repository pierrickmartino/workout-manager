"use server";

import { redirect } from "next/navigation";

import { redeemShare } from "@/lib/sessions";
import { toRedeemResult } from "@/lib/redeem-share";

export interface RedeemFormState {
  error: string | null;
}

// Redeem a Share Link into a new standalone Session the recipient owns (Redeem, ADR-0057, issue
// #398). On success we redirect to the new copy so the recipient lands on the plan they can rename,
// favorite, edit, log, and re-share; on failure — a revoked or unknown link (404) — the error is
// returned for the button to surface. Each Redeem yields a fresh copy. `redirect` throws to
// navigate, so it runs after the write and outside any try/catch.
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

  redirect(result.href);
}
