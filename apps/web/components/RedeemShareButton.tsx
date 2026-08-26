"use client";

import { useActionState } from "react";
import { Download } from "lucide-react";

import { submitRedeem, type RedeemFormState } from "@/app/shared/[token]/actions";
import { Button } from "@/components/ui/button";

interface RedeemShareButtonProps {
  token: string;
}

// Redeem this Share Link into a new standalone Session the recipient owns (Redeem, ADR-0057, issue
// #398). Posts to the redeem server action, which redirects to the new copy on success. Each
// Redeem yields a fresh copy, so there is no spent state; a revoked/invalid link shows an inline
// error (the preview is a live snapshot, so a link can go invalid between preview and Redeem).
export function RedeemShareButton({ token }: RedeemShareButtonProps) {
  const [state, action, pending] = useActionState<RedeemFormState, FormData>(
    submitRedeem,
    { error: null },
  );

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="token" value={token} />
      <Button type="submit" className="w-full" disabled={pending}>
        <Download className="h-4 w-4" />
        {pending ? "Saving to your sessions…" : "Save to my sessions"}
      </Button>
      {state.error ? (
        <span role="alert" className="font-mono text-[12px] text-magenta">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
