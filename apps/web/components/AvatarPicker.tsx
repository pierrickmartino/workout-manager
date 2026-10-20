"use client";

import { useRef, useState, useTransition } from "react";

import { updateAvatar } from "@/app/profile/appearance-actions";
import { buildAvatarOptions, type AvatarCatalog } from "@/lib/avatar/avatar-picker";
import { Alert } from "@/components/pulse/alert";
import { Avatar } from "@/components/pulse/avatar";
import { cn } from "@/lib/utils";

interface AvatarPickerProps {
  // The catalog with lock state, read server-side from GET /api/avatars.
  catalog: AvatarCatalog;
  // The user's current Avatar, read server-side; the initial selection.
  currentAvatarId: string;
}

// The Avatar picker (ADR-0136): a grid of native radios, one per catalog Avatar, so arrow
// keys, Space and Tab behave as any radio group does. The options come from the pure
// `buildAvatarOptions` view-model. Selection is optimistic and saves through a thin server
// action (updateAvatar → PUT /api/appearance), which revalidates the layout so the header
// shows the new Avatar on the next render; a failed save reverts to the Avatar actually
// stored and says why. The radios stay enabled while a save runs, since disabling one would
// drop the keyboard focus it holds; only the latest choice's outcome is applied.
export function AvatarPicker({
  catalog,
  currentAvatarId,
}: AvatarPickerProps): React.JSX.Element {
  const [selected, setSelected] = useState(currentAvatarId);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // The Avatar the backend last confirmed, and the choice whose outcome still counts.
  const stored = useRef(currentAvatarId);
  const latest = useRef(currentAvatarId);

  const options = buildAvatarOptions(catalog, selected);

  function choose(avatarId: string): void {
    if (avatarId === selected) return;
    setSelected(avatarId);
    setError(null);
    latest.current = avatarId;
    startTransition(async () => {
      const result = await updateAvatar(avatarId);
      if (latest.current !== avatarId) return;
      if (result.error) {
        setSelected(stored.current);
        setError(result.error);
        return;
      }
      stored.current = avatarId;
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
