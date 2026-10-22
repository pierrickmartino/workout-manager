"use client";

import { useState, useTransition } from "react";

import { publishUniverse } from "@/app/admin/avatar-universe-actions";
import type { AvatarUniverse } from "@/lib/avatar/avatar-art";
import { buildAvatarUniverseControl } from "@/lib/avatar/avatar-universe-control";
import { Alert } from "@/components/pulse/alert";
import { Avatar } from "@/components/pulse/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AvatarUniversePublisherProps {
  // The published Avatar Universe at load, read server-side.
  activeUniverse: AvatarUniverse;
}

// The admin-only Avatar Universe switch (ADR-0137): the three universes, each previewed by its
// whole cast of portraits, and an explicit Publish that makes the picked one app-wide
// (publishUniverse → PUT /api/avatar-universe). Every user keeps the Avatar they chose; only
// the character drawn for it changes. Options and pending state come from the pure
// `buildAvatarUniverseControl` view-model, so this component owns only the pick, the pending
// and error UI, and promoting the pick once the publish succeeds.
export function AvatarUniversePublisher({
  activeUniverse,
}: AvatarUniversePublisherProps): React.JSX.Element {
  const [active, setActive] = useState<AvatarUniverse>(activeUniverse);
  const [picked, setPicked] = useState<AvatarUniverse>(activeUniverse);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const control = buildAvatarUniverseControl(active, picked);

  function pick(universe: AvatarUniverse): void {
    setError(null);
    setPicked(universe);
  }

  function publish(): void {
    setError(null);
    startTransition(async () => {
      const result = await publishUniverse(picked);
      if (result.error) {
        setError(result.error);
        return;
      }
      setActive(picked);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="label-mono text-[11px] text-text-secondary">
          AVATARS · ADMIN
        </span>
        <span className="label-mono text-[10px] text-text-muted">
          {control.hasPendingPick ? "NOT PUBLISHED" : "PUBLISHED"}
        </span>
      </div>

      <div role="radiogroup" aria-label="Avatar Universe" className="flex flex-col gap-2">
        {control.options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.isPicked}
            disabled={isPending}
            onClick={() => pick(option.value)}
            className={cn(
              "flex min-w-0 flex-col gap-2.5 rounded-sm border px-3.5 py-3 text-left transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-60",
              option.isPicked && !option.isActive
                ? "border-violet bg-violet-dim"
                : option.isActive
                  ? "border-cyan bg-cyan-dim"
                  : "border-border bg-elevated/40 hover:bg-elevated/70",
            )}
          >
            <span className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 flex-col gap-1">
                <span
                  className={cn(
                    "font-sans text-[15px] font-medium",
                    option.isPicked && !option.isActive
                      ? "text-violet"
                      : option.isActive
                        ? "text-cyan"
                        : "text-text-primary",
                  )}
                >
                  {option.label}
                </span>
                <span className="label-mono text-[10px] text-text-secondary">
                  {option.caption}
                </span>
              </span>
              {option.isActive ? (
                <span className="label-mono text-[10px] font-bold text-cyan">ACTIVE</span>
              ) : option.isPicked ? (
                <span className="label-mono text-[10px] font-bold text-violet">PICKED</span>
              ) : null}
            </span>
            {/* The cast as this universe draws it: the preview is the portraits themselves, in
                two rows of four so a narrow card never strands one portrait on a row alone. */}
            <span className="grid w-fit grid-cols-4 gap-1 sm:grid-cols-8">
              {option.cast.map((art) => (
                <Avatar key={art.id} art={art} size={28} />
              ))}
            </span>
          </button>
        ))}
      </div>

      {control.hasPendingPick ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={isPending}
            onClick={publish}
          >
            {isPending ? "Publishing…" : "Publish"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => pick(active)}
          >
            Cancel
          </Button>
        </div>
      ) : null}

      {error ? <Alert announce tone="error">{error}</Alert> : null}
    </div>
  );
}
