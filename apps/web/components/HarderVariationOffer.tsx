"use client";

import { useActionState, useState } from "react";
import { TrendingUp } from "lucide-react";

import {
  submitAdvanceVariation,
  type SubstituteFormState,
} from "@/app/sessions/[id]/actions";
import { Button } from "@/components/ui/button";
import type { HarderVariationOffer as OfferView } from "@/lib/harder-variation-view";

interface HarderVariationOfferProps {
  sessionId: number;
  position: number;
  offer: OfferView;
}

// An unobtrusive offer, shown only on a pure-bodyweight prescription that has hit
// its rep ceiling (#202), to advance to the next harder Variation. Accepting posts
// the suggested Exercise as `target_exercise_id` through the existing user-initiated
// Substitution flow; declining is a client-only dismissal that makes no write call,
// keeping Substitution user-driven (CONTEXT). All copy comes from the view-model so
// this component stays thin.
export function HarderVariationOffer({
  sessionId,
  position,
  offer,
}: HarderVariationOfferProps) {
  const [dismissed, setDismissed] = useState(false);
  const [state, action, pending] = useActionState<SubstituteFormState, FormData>(
    submitAdvanceVariation,
    { error: null },
  );

  if (offer.kind !== "offer" || dismissed) return null;

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-border-lite bg-base p-3">
      <div className="flex items-start gap-2">
        <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-cyan" />
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[12px] font-semibold uppercase tracking-wider text-cyan">
            {offer.headline}
          </span>
          <p className="font-sans text-[13px] leading-relaxed text-text-secondary">
            {offer.body}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <form action={action} className="flex items-center gap-3">
          <input type="hidden" name="session_id" value={sessionId} />
          <input type="hidden" name="position" value={position} />
          <input
            type="hidden"
            name="target_exercise_id"
            value={offer.exerciseId}
          />
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            {pending ? "Advancing…" : offer.acceptLabel}
          </Button>
        </form>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setDismissed(true)}
          disabled={pending}
        >
          {offer.dismissLabel}
        </Button>
      </div>
      {state.error ? (
        <span role="alert" className="font-mono text-[12px] text-magenta">
          {state.error}
        </span>
      ) : null}
    </div>
  );
}
