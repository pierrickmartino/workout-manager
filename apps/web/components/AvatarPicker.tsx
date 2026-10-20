"use client";

import { useOptimistic, useState, useTransition } from "react";

import { updateAvatar } from "@/app/profile/appearance-actions";
import { buildAvatarOptions, type AvatarCatalog } from "@/lib/avatar/avatar-picker";
import { Alert } from "@/components/pulse/alert";
import { Avatar } from "@/components/pulse/avatar";
import { cn } from "@/lib/utils";

interface AvatarPickerProps {
  // The catalog with lock state, read server-side from GET /api/avatars.
  catalog: AvatarCatalog;
  // The user's stored Avatar, read server-side; a successful save revalidates it.
  currentAvatarId: string;
}

// The Avatar picker (ADR-0136): a grid of native radios, one per catalog Avatar, so arrow
// keys, Space and Tab behave as any radio group does. The options come from the pure
// `buildAvatarOptions` view-model. Selection is optimistic over the stored Avatar prop and
// saves through a thin server action (updateAvatar → PUT /api/appearance), which revalidates
// the layout so the header and this prop show the new Avatar on the next render. A failed
// save leaves the prop as it was, so the selection falls back to the Avatar actually stored,
// and the picker says why. The radios stay enabled while a save runs, since disabling one
// would drop the keyboard focus it holds.
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
                "flex min-w-0 cursor-pointer flex-col items-center gap-2 rounded-sm border px-3 py-4 text-center transition-colors",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cyan",
                option.selected
                  ? "border-cyan bg-cyan-dim"
                  : "border-border bg-elevated/40 hover:bg-elevated/70",
              )}
            >
              <input
                type="radio"
                name="avatar"
                value={option.id}
                checked={option.selected}
                onChange={() => choose(option.id)}
                aria-label={option.label}
                className="sr-only"
              />
              <Avatar art={option.art} size={64} />
              <span
                className={cn(
                  "font-sans text-[15px] font-medium break-words",
                  option.selected ? "text-cyan" : "text-text-primary",
                )}
              >
                {option.name}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {error ? <Alert announce tone="error">{error}</Alert> : null}
    </div>
  );
}
