"use client";

import { useActionState, useCallback } from "react";

import type { SessionSummary } from "@/lib/session-library";
import {
  canDeleteSessionRow,
  sessionSummaryCardModel,
} from "@/lib/session-card";
import {
  submitDeleteSessionRow,
  submitToggleFavorite,
  type ToggleFavoriteState,
} from "@/app/sessions/actions";
import { SessionCard } from "@/components/SessionCard";
import { DeleteSessionControl } from "@/components/DeleteSessionControl";
import { ActionSheet } from "@/components/pulse/action-sheet";
import { ActionSheetSeparator } from "@/components/pulse/action-sheet-item";
import { FavoriteSheetItem } from "@/components/FavoriteSheetItem";
import { useLongPress } from "@/components/use-long-press";

// One My Sessions library row: the shared `SessionCard` plus the interactions the library adds on
// top of Train's read-only card (GLOSSARY: My Sessions, Favorite, Delete). Favoriting has no star on
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
        claimsSigilMorph
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
// never-performed plan (GLOSSARY: Delete, ADR-0063). Its trigger sits beside Start, so a closed row
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
      <FavoriteSheetItem
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
