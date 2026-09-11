"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, Download } from "lucide-react";

import { submitRedeem, type RedeemFormState } from "@/app/shared/[token]/actions";
import { Alert } from "@/components/pulse/alert";
import { Button, buttonVariants } from "@/components/ui/button";

interface RedeemShareButtonProps {
  token: string;
}

// Redeem this Share Link into a new standalone Session the recipient owns (Redeem, ADR-0057/0058,
// issues #398/#399). Posts to the redeem server action. For an unflagged redeem the action
// redirects to the new copy; for a redeemer with a Sensitive Constraint it returns the ADR-0058
// caveat instead, which we render **prominently** — the copy is saved, but the recipient is told
// it was built for another user and is not tailored to their constraints, and chooses when to open
// it (it is never auto-promoted into the active flow). Each Redeem yields a fresh copy, so there is
// no spent state; a revoked/invalid link shows an inline error (a link can go invalid between
// preview and Redeem).
export function RedeemShareButton({ token }: RedeemShareButtonProps) {
  const [state, action, pending] = useActionState<RedeemFormState, FormData>(
    submitRedeem,
    { error: null },
  );

  // Received-Share caveat state (ADR-0058): the copy is saved, so the redeem control is replaced
  // by the prominent safety notice plus a deliberate link to the saved copy — never an
  // auto-redirect. The `error`-tone Alert carries the design system's warning accent and icon.
  if (state.caveat) {
    return (
      <div className="flex flex-col gap-3">
        <Alert tone="error" role="alert">
          <span className="mb-1 block font-semibold uppercase tracking-wide">
            Not tailored to you
          </span>
          {state.caveat.message}
        </Alert>
        <Link
          href={state.caveat.href}
          className={buttonVariants({ variant: "secondary", className: "w-full" })}
        >
          View saved session
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

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
