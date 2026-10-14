"use client";

// PROTOTYPE — throwaway (see ./header-variants.tsx). The Session detail's ⋯ sheet with Favorite
// folded in as its first row. The favorite state lives here, outside the sheet, so a failure still
// shows after the sheet closes itself (the sheet unmounts its rows on close).

import { startTransition, useActionState } from "react";
import { Star } from "@/components/pulse/icons";

import { submitFavorite, type FavoriteFormState } from "@/app/sessions/[id]/actions";
import { ActionSheet, useActionSheet } from "@/components/pulse/action-sheet";
import {
  ActionSheetItemText,
  actionSheetItemClass,
} from "@/components/pulse/action-sheet-item";
import { favoriteActionLabel } from "@/lib/session-card";
import { cn } from "@/lib/utils";

interface SessionActionsMenuProps {
  sessionId: number;
  // null on a Protocol member: no Favorite row at all.
  isFavorite: boolean | null;
  // Variant B: a small star pip on the ⋯ trigger when the Session is favorited.
  showFavoritePip?: boolean;
  children: React.ReactNode;
}

export function SessionActionsMenu({
  sessionId,
  isFavorite,
  showFavoritePip = false,
  children,
}: SessionActionsMenuProps) {
  const [state, dispatch, pending] = useActionState<FavoriteFormState, FormData>(
    submitFavorite,
    { error: null },
  );

  function toggle() {
    const form = new FormData();
    form.set("session_id", String(sessionId));
    form.set("favorite", isFavorite ? "false" : "true");
    startTransition(() => dispatch(form));
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <span className="relative inline-flex">
        <ActionSheet label="Session actions" title="Session actions">
          {isFavorite === null ? null : (
            <FavoriteRow isFavorite={isFavorite} pending={pending} onToggle={toggle} />
          )}
          {children}
        </ActionSheet>
        {showFavoritePip && isFavorite ? (
          <Star
            className="pointer-events-none absolute -top-0.5 -right-0.5 h-3 w-3 fill-cyan text-cyan"
            aria-hidden
          />
        ) : null}
      </span>
      {state.error ? (
        <span role="alert" className="font-mono text-[12px] text-magenta">
          {state.error}
        </span>
      ) : null}
    </div>
  );
}

function FavoriteRow({
  isFavorite,
  pending,
  onToggle,
}: {
  isFavorite: boolean;
  pending: boolean;
  onToggle: () => void;
}) {
  const sheet = useActionSheet();
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={isFavorite}
      onClick={() => {
        onToggle();
        sheet?.actions.close();
      }}
      className={cn(actionSheetItemClass(), isFavorite && "text-cyan")}
    >
      <Star className={cn("h-4 w-4 shrink-0", isFavorite && "fill-cyan")} aria-hidden />
      <ActionSheetItemText
        label={favoriteActionLabel(isFavorite)}
        description={
          isFavorite ? "Remove it from your Favorites filter" : "Pin it to your Favorites filter"
        }
      />
    </button>
  );
}
