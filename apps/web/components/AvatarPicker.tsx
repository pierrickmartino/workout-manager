"use client";

import { useOptimistic, useState, useTransition } from "react";

import { updateAvatar } from "@/app/profile/appearance-actions";
import {
  buildAvatarOptions,
  type AvatarCatalog,
  type AvatarOptionAppearance,
} from "@/lib/avatar/avatar-picker";
import { Alert } from "@/components/pulse/alert";
import { Avatar } from "@/components/pulse/avatar";
import { Lock } from "@/components/pulse/icons";
import { cn } from "@/lib/utils";

interface AvatarPickerProps {
  // The catalog with lock state, read server-side from GET /api/avatars.
  catalog: AvatarCatalog;
  // The user's stored Avatar, read server-side; a successful save revalidates it.
  currentAvatarId: string;
}

// Card, name and progress classes per option appearance, spelled out so Tailwind sees every
// class. Text on the selected card is cyan, the one rung declared on `cyan-dim` (ADR-0086).
const APPEARANCE_CLASSES: Readonly<
  Record<AvatarOptionAppearance, { card: string; name: string; progress: string }>
> = {
  selected: {
    card: "cursor-pointer border-cyan bg-cyan-dim",
    name: "text-cyan",
    progress: "text-cyan",
  },
  open: {
    card: "cursor-pointer border-border bg-elevated/40 hover:bg-elevated/70",
    name: "text-text-primary",
    progress: "text-text-muted",
  },
  locked: {
    card: "cursor-not-allowed border-dashed border-border bg-base",
    name: "text-text-secondary",
    progress: "text-text-muted",
  },
};

// The Avatar picker (ADR-0136): a grid of native radios, one per catalog Avatar, so arrow
// keys, Space and Tab behave as any radio group does. The options come from the pure
// `buildAvatarOptions` view-model. Selection is optimistic over the stored Avatar prop and
// saves through a thin server action (updateAvatar → PUT /api/appearance), which revalidates
// the layout so the header and this prop show the new Avatar on the next render. A failed
// save leaves the prop as it was, so the selection falls back to the Avatar actually stored,
// and the picker says why. The radios stay enabled while a save runs, since disabling one
// would drop the keyboard focus it holds. A locked Avatar is the one disabled radio: a greyed
// portrait with the level it needs and the user's progress toward it, announced as locked.
// The API refuses it too; the picker never offers what the save would turn down. An Avatar the
// user kept after their level dropped stays drawn as theirs, with a checked radio that keeps
// the group's focus, and its progress beneath.
export function AvatarPicker({
  catalog,
  currentAvatarId,
}: AvatarPickerProps): React.JSX.Element {
  const [selected, setSelected] = useOptimistic(currentAvatarId);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const options = buildAvatarOptions(catalog, selected);

  function choose(avatarId: string): void {
    if (avatarId === selected) return;
    setError(null);
    startTransition(async () => {
      setSelected(avatarId);
      const result = await updateAvatar(avatarId);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="min-w-0">
        <legend className="sr-only">Avatar</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {options.map((option) => (
            <label
              key={option.id}
              className={cn(
                "flex min-w-0 flex-col items-center gap-2 rounded-sm border px-3 py-4 text-center transition-colors",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cyan",
                APPEARANCE_CLASSES[option.appearance].card,
              )}
            >
              <input
                type="radio"
                name="avatar"
                value={option.id}
                checked={option.selected}
                disabled={option.appearance === "locked"}
                onChange={() => choose(option.id)}
                aria-label={option.label}
                className="sr-only"
              />
              <Avatar
                art={option.art}
                size={64}
                silhouette={option.appearance === "locked"}
              />
              <span
                className={cn(
                  "font-sans text-[15px] font-medium break-words",
                  APPEARANCE_CLASSES[option.appearance].name,
                )}
              >
                {option.name}
              </span>
              {option.progress ? (
                <span
                  className={cn(
                    "flex items-center gap-1 font-mono text-[12px] tabular-nums",
                    APPEARANCE_CLASSES[option.appearance].progress,
                  )}
                >
                  <Lock aria-hidden className="size-3" />
                  {option.progress}
                </span>
              ) : null}
            </label>
          ))}
        </div>
      </fieldset>
      {error ? <Alert announce tone="error">{error}</Alert> : null}
    </div>
  );
}
