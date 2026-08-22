"use client";

import { useState, useTransition } from "react";
import { Pin, TrendingUp } from "lucide-react";

import {
  advanceVariationFromOffer,
  pinFromOffer,
} from "@/app/sessions/[id]/log/actions";
import { normalizePinTarget, type PinDialogModel } from "@/lib/log-session-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PinOfferDialogProps {
  dialog: PinDialogModel;
  sessionId: number;
  // Called after the Pin (or a harder-Variation advance) is issued successfully — the caller
  // moves on to the next offer, or leaves for History when the queue is empty.
  onResolved: () => void;
  // Leave this offer without pinning — the log is already saved, so this just moves on.
  onDismiss: () => void;
}

// The post-log Pin offer (ADR-0053, #371). Shown after a bodyweight Session is logged where every
// working set beat the top of the prescribed rep range on a movement; all of its content — the
// copy, the pre-filled editable range, and the harder-Variation alternative — comes from the
// `buildPinDialog` view-model, so this component stays a thin renderer. The Session just logged is
// settled record and untouched; only the forward plan changes.
//
// Confirming issues the Pin request straight away (`pinFromOffer`) and surfaces the backend result
// inline — a performed Session's `409` shows as a message rather than silently failing. The
// harder-Variation alternative is offered *beside* raising reps, so the harder-movement path is
// never hidden; accepting it advances the movement through the Substitution flow.
export function PinOfferDialog({
  dialog,
  sessionId,
  onResolved,
  onDismiss,
}: PinOfferDialogProps) {
  const [reps, setReps] = useState(dialog.proposedReps);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const invalid = normalizePinTarget(reps) === null;

  const pin = () => {
    setError(null);
    startTransition(async () => {
      const result = await pinFromOffer(sessionId, dialog.position, reps);
      if (result.error) {
        setError(result.error);
        return;
      }
      onResolved();
    });
  };

  const advance = (targetExerciseId: number) => {
    setError(null);
    startTransition(async () => {
      const result = await advanceVariationFromOffer(
        sessionId,
        dialog.position,
        targetExerciseId,
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      onResolved();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-offer-title"
    >
      <div className="flex w-full max-w-md flex-col gap-4 rounded-md border border-border bg-surface p-5 shadow-lg">
        <div className="flex flex-col gap-1.5">
          <h2
            id="pin-offer-title"
            className="font-display text-[17px] font-semibold text-text-primary"
          >
            {dialog.title}
          </h2>
          <p className="font-sans text-[13px] leading-relaxed text-text-secondary">
            {dialog.body}
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">
            New rep target
          </span>
          <Input
            value={reps}
            onChange={(event) => setReps(event.target.value)}
            placeholder="10-14"
            aria-label="New rep target"
            aria-invalid={invalid}
          />
          <span className="font-mono text-[11px] text-text-muted">
            Edit before pinning — a one-off max needn&apos;t become your everyday target.
          </span>
        </label>

        <Button
          type="button"
          onClick={pin}
          disabled={invalid || pending}
          className="w-full"
        >
          <Pin className="h-4 w-4" />
          {pending ? "Pinning…" : dialog.confirmLabel}
        </Button>

        {/* The harder-Variation alternative, beside "raise reps" (#202) — never hidden. */}
        {dialog.harderVariation.kind === "offer" ? (
          <div className="flex flex-col gap-2 rounded-sm border border-border-lite bg-base p-3">
            <div className="flex items-start gap-2">
              <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-cyan" />
              <p className="font-sans text-[13px] leading-relaxed text-text-secondary">
                {dialog.harderVariation.body}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (dialog.harderVariation.kind === "offer") {
                  advance(dialog.harderVariation.exerciseId);
                }
              }}
              disabled={pending}
              className="self-start"
            >
              {dialog.harderVariation.acceptLabel}
            </Button>
          </div>
        ) : null}

        {error ? (
          <span role="alert" className="font-mono text-[12px] text-magenta">
            {error}
          </span>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          disabled={pending}
          className="self-center"
        >
          {dialog.dismissLabel}
        </Button>
      </div>
    </div>
  );
}
