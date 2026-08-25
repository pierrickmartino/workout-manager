"use client";

import { useActionState } from "react";
import { Heart } from "lucide-react";

import {
  submitFavorite,
  type FavoriteFormState,
} from "@/app/sessions/[id]/actions";
import { Button } from "@/components/ui/button";

interface FavoriteSessionControlProps {
  sessionId: number;
  // The current marker — drives the label, the filled/outline icon, and the next state the
  // toggle submits (the opposite of this).
  isFavorite: boolean;
}

// The standalone Session's Favorite toggle (CONTEXT: Favorite, issue #396). Rendered only on
// standalone Sessions — the caller withholds it on a Protocol member (Favorite is standalone-only,
// like the Session Name), mirroring how Rename/Duplicate are withheld there. Marking is a stored,
// per-user, per-copy preference; the toggle submits the opposite of the current state through the
// favorite action, which revalidates so the label and icon flip in place. A thin renderer: the
// ownership and standalone-only guards live server-side.
export function FavoriteSessionControl({
  sessionId,
  isFavorite,
}: FavoriteSessionControlProps) {
  const [state, action, pending] = useActionState<FavoriteFormState, FormData>(
    submitFavorite,
    { error: null },
  );

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="session_id" value={sessionId} />
      {/* The desired next state: the opposite of the current marker. */}
      <input type="hidden" name="favorite" value={isFavorite ? "false" : "true"} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        aria-pressed={isFavorite}
        aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        disabled={pending}
      >
        <Heart
          className={`h-3.5 w-3.5 ${isFavorite ? "fill-current" : ""}`}
          aria-hidden
        />
        {isFavorite ? "Favorited" : "Favorite"}
      </Button>
      {state.error ? (
        <span role="alert" className="font-mono text-[12px] text-magenta">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
