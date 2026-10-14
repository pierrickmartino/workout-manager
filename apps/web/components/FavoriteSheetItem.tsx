"use client";

import { Star } from "@/components/pulse/icons";

import { useActionSheet } from "@/components/pulse/action-sheet";
import {
  ActionSheetItemText,
  actionSheetItemClass,
} from "@/components/pulse/action-sheet-item";
import { favoriteActionDescription, favoriteActionLabel } from "@/lib/session-card";
import { cn } from "@/lib/utils";

interface FavoriteSheetItemProps {
  // The current marker; the row offers its opposite.
  isFavorite: boolean;
  onToggle: () => void;
  pending: boolean;
}

// The Favorite row of a Session's ⋯ action sheet (GLOSSARY: Favorite, ADR-0113, ADR-0133), shared
// by a My Sessions row and the Session detail. Favorite is a one-tap action that leaves the page as
// it was, so it closes its own sheet; the caller holds the toggle's state outside the sheet, so a
// failure still shows once the sheet (and this row) has unmounted, and the page's own favorited
// marker — a row's Glow Edge, the detail's glowing sigil and chip — shows the result.
export function FavoriteSheetItem({
  isFavorite,
  onToggle,
  pending,
}: FavoriteSheetItemProps): React.JSX.Element {
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
      <ActionSheetItemText
        label={favoriteActionLabel(isFavorite)}
        description={favoriteActionDescription(isFavorite)}
      />
    </button>
  );
}
