"use client";

import { startTransition, useActionState } from "react";

import { submitFavorite, type FavoriteFormState } from "@/app/sessions/[id]/actions";
import { ActionSheet } from "@/components/pulse/action-sheet";
import { FavoriteSheetItem } from "@/components/FavoriteSheetItem";

interface SessionActionsSheetProps {
  sessionId: number;
  // The current Favorite marker, or `null` where Favorite is not offered (a Protocol member, whose
  // marker the server withholds) — then the sheet has no Favorite row.
  isFavorite: boolean | null;
  // The rest of the sheet's rows, rendered by the (server) page.
  children: React.ReactNode;
}

// The Session detail's ⋯ action sheet (ADR-0113), pinned to the header's top-right corner. Favorite
// is its first row (ADR-0133): a one-tap toggle that closes the sheet, the glowing sigil and the
// FAVORITE chip in the header then showing the result. The toggle's state lives here, outside the
// sheet, because the sheet unmounts its rows on close — so a failure (a 404/409 from the favorite
// action) surfaces under the trigger instead of vanishing with the row.
export function SessionActionsSheet({
  sessionId,
  isFavorite,
  children,
}: SessionActionsSheetProps): React.JSX.Element {
  const [state, dispatch, pending] = useActionState<FavoriteFormState, FormData>(
    submitFavorite,
    { error: null },
  );

  function toggleFavorite(): void {
    if (isFavorite === null || pending) return;
    const form = new FormData();
    form.set("session_id", String(sessionId));
    // The desired next state: the opposite of the current marker.
    form.set("favorite", isFavorite ? "false" : "true");
    startTransition(() => dispatch(form));
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <ActionSheet label="Session actions" title="Session actions">
        {isFavorite === null ? null : (
          <FavoriteSheetItem isFavorite={isFavorite} onToggle={toggleFavorite} pending={pending} />
        )}
        {children}
      </ActionSheet>
      {state.error ? (
        <span role="alert" className="font-mono text-[12px] text-magenta">
          {state.error}
        </span>
      ) : null}
    </div>
  );
}
