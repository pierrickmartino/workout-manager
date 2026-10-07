"use client";

import { useActionState, useCallback } from "react";
import { Star } from "@/components/pulse/icons";

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
import {
  ActionSheet,
  useActionSheet,
} from "@/components/pulse/action-sheet";
import {
  ActionSheetItemText,
  ActionSheetSeparator,
  actionSheetItemClass,
} from "@/components/pulse/action-sheet-item";
import { useLongPress } from "@/components/use-long-press";

// One My Sessions library row: the shared `SessionCard` plus the interactions the library adds on
// top of Train's read-only card (CONTEXT: My Sessions, Favorite, Delete). Favoriting has no star on
// the card face any more (Q6) — the Glow Edge carries the state — so the write lives in two places
// that share one action: the ⋯ action sheet (the accessible, cross-platform home) and a
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

// The row's ⋯ action sheet (ADR-0113): Favorite/Unfavorite always, Delete only for a
// never-performed plan (CONTEXT: Delete, ADR-0063). Its trigger sits beside Start, so a closed row
// spends no line on it; the sheet is titled with the plan's name, and the trigger names it too,
// since every row on the screen carries one.
function SessionRowMenu({
  session,
  onToggleFavorite,
  favoritePending,
}: {
  session: SessionSummary;
  onToggleFavorite: () => void;
  favoritePending: boolean;
}): React.JSX.Element {
  return (
    <ActionSheet label={`Actions for ${session.display_name}`} title={session.display_name}>
      <FavoriteItem
        isFavorite={session.is_favorite}
        onToggle={onToggleFavorite}
        pending={favoritePending}
      />
      {canDeleteSessionRow(session.logged_count) ? (
        <>
          <ActionSheetSeparator />
          <DeleteSessionControl sessionId={session.id} action={submitDeleteSessionRow} />
        </>
      ) : null}
    </ActionSheet>
  );
}

// Favorite is a one-tap action that leaves the list as it was, so it closes its own sheet: the
// Glow Edge on the card then shows the result, and a failure surfaces below the card (outside the
// sheet), so nothing is lost by closing.
function FavoriteItem({
  isFavorite,
  onToggle,
  pending,
}: {
  isFavorite: boolean;
  onToggle: () => void;
  pending: boolean;
}): React.JSX.Element {
  const sheet = useActionSheet();

  return (
    <button
      type="button"
      onClick={() => {
        onToggle();
        sheet?.actions.close();
      }}
      disabled={pending}
      aria-pressed={isFavorite}
      className={cn(actionSheetItemClass(), isFavorite && "text-cyan")}
    >
      <Star className={cn("h-4 w-4 shrink-0", isFavorite && "fill-cyan")} aria-hidden />
      <ActionSheetItemText label={favoriteActionLabel(isFavorite)} />
    </button>
  );
}
