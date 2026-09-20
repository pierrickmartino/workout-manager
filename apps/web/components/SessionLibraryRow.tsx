"use client";

import { useActionState, useCallback } from "react";
import { Star } from "lucide-react";

import type { SessionSummary } from "@/lib/session-library";
import {
  canDeleteSessionRow,
  favoriteActionLabel,
  sessionSummaryCardModel,
} from "@/lib/session-card";
import {
  submitDeleteSessionRow,
  submitToggleFavorite,
  type ToggleFavoriteState,
} from "@/app/sessions/actions";
import { cn } from "@/lib/utils";
import { SessionCard } from "@/components/SessionCard";
import { DeleteSessionControl } from "@/components/DeleteSessionControl";
import { OverflowMenu } from "@/components/pulse/overflow-menu";
import { useLongPress } from "@/components/use-long-press";

// One My Sessions library row: the shared `SessionCard` plus the interactions the library adds on
// top of Train's read-only card (CONTEXT: My Sessions, Favorite, Delete). Favoriting has no star on
// the card face any more (Q6) — the Glow Edge carries the state — so the write lives in two places
// that share one action: the ⋯ overflow menu (the accessible, cross-platform home) and a
// press-and-hold shortcut on the card. Both dispatch the same `submitToggleFavorite`; a 404/409
// (e.g. a Protocol member) or transport failure surfaces inline below the card, and nothing toggles.
export function SessionLibraryRow({
  session,
}: {
  session: SessionSummary;
}): React.JSX.Element {
  const [favoriteState, toggleFavoriteAction, favoritePending] = useActionState<
    ToggleFavoriteState,
    FormData
  >(submitToggleFavorite, { error: null });

  // Build the same payload the old star form posted (the *target* marker) and dispatch it, so the
  // menu item and the long-press shortcut are one write with one in-flight/error state.
  const toggleFavorite = useCallback(() => {
    if (favoritePending) {
      return;
    }
    const form = new FormData();
    form.set("session_id", String(session.id));
    form.set("favorite", session.is_favorite ? "false" : "true");
    toggleFavoriteAction(form);
  }, [favoritePending, session.id, session.is_favorite, toggleFavoriteAction]);

  const longPress = useLongPress(toggleFavorite);

  return (
    <div {...longPress}>
      <SessionCard
        model={sessionSummaryCardModel(session)}
        isFavorite={session.is_favorite}
        actions={
          <SessionRowMenu
            session={session}
            onToggleFavorite={toggleFavorite}
            favoritePending={favoritePending}
          />
        }
      />
      {favoriteState.error ? (
        <p role="alert" className="mt-1 font-mono text-[12px] text-magenta">
          {favoriteState.error}
        </p>
      ) : null}
    </div>
  );
}

// The row's ⋯ overflow menu: Favorite/Unfavorite always, Delete only for a never-performed plan
// (CONTEXT: Delete, ADR-0063). Reuses the native <details> `OverflowMenu` (keyboard- and
// screen-reader-accessible) and the existing two-step inline `DeleteSessionControl`, so the delete
// flow is byte-for-byte the one the row used before — only its home moved into the menu.
function SessionRowMenu({
  session,
  onToggleFavorite,
  favoritePending,
}: {
  session: SessionSummary;
  onToggleFavorite: () => void;
  favoritePending: boolean;
}): React.JSX.Element {
  const label = favoriteActionLabel(session.is_favorite);

  return (
    <OverflowMenu label="Actions">
      <button
        type="button"
        onClick={onToggleFavorite}
        disabled={favoritePending}
        aria-pressed={session.is_favorite}
        className={cn(
          "inline-flex items-center gap-2 rounded-sm text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 disabled:opacity-50 motion-reduce:transition-none",
          session.is_favorite
            ? "text-cyan"
            : "text-text-secondary hover:text-cyan",
        )}
      >
        <Star
          className={cn("h-4 w-4", session.is_favorite && "fill-cyan")}
          aria-hidden
        />
        {label}
      </button>
      {canDeleteSessionRow(session.logged_count) ? (
        <DeleteSessionControl
          sessionId={session.id}
          action={submitDeleteSessionRow}
          confirmPrompt="Delete?"
        />
      ) : null}
    </OverflowMenu>
  );
}
