"use client";

// PROTOTYPE — throwaway. "More realistic Avatars, in three universes": the real catalog (its
// ids, unlock levels and the user's lock state) drawn by a lit portrait rig in one of three
// universes, switchable via `?variant=` on the existing /profile/avatar route:
//   current — today's flat tone-only art (the shipped AvatarPicker), for comparison
//   A — The Realm (fantasy, today's roster redrawn)
//   B — Orbit (sci-fi station crew)
//   C — Olympus (ancient games and myth)
// Each universe shows its AI-generated portraits from `public/avatars/<folder>/<id>.webp`
// (see the README there); `?art=svg` swaps back to the drawn portrait rig for comparison.
// Selecting here is a local preview only; nothing is saved. Not for main.

import * as React from "react";

import type { AvatarCatalog } from "@/lib/avatar/avatar-picker";
import { Lock } from "@/components/pulse/icons";
import { cn } from "@/lib/utils";

import { PortraitSvg, type Portrait } from "./prototype-portrait-rig";
import { REALM } from "./prototype-universe-realm";
import { ORBIT } from "./prototype-universe-orbit";
import { OLYMPUS } from "./prototype-universe-olympus";

export const UNIVERSES = {
  A: { name: "The Realm", tagline: "Fantasy heroes, lit like oil paintings", roster: REALM, folder: "realm" },
  B: { name: "Orbit", tagline: "The crew of a deep-space station", roster: ORBIT, folder: "orbit" },
  C: { name: "Olympus", tagline: "Figures of the ancient games and myth", roster: OLYMPUS, folder: "olympus" },
} as const;

export type UniverseKey = keyof typeof UNIVERSES;

// Which art the universe is shown in: the generated portrait images, or the drawn SVG rig.
export type PortraitArt = "image" | "svg";

interface Props {
  universe: UniverseKey;
  art: PortraitArt;
  catalog: AvatarCatalog;
  currentAvatarId: string;
}

// The same dimming the SVG rig uses for a locked Avatar, applied to the image.
const LOCKED_FILTER = "grayscale(1) brightness(0.3) contrast(0.9)";

// One character's portrait at a given size: the generated image cropped to a circle, or the
// drawn rig. Decorative, as in the shipped picker: the button's text names the character.
function PortraitArtwork({
  portrait,
  folder,
  art,
  size,
  locked = false,
}: {
  portrait: Portrait;
  folder: string;
  art: PortraitArt;
  size: number;
  locked?: boolean;
}): React.JSX.Element {
  if (art === "svg") return <PortraitSvg p={portrait} size={size} locked={locked} />;
  return (
    <img
      src={`/avatars/${folder}/${portrait.id}.webp`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size, filter: locked ? LOCKED_FILTER : undefined }}
    />
  );
}

export function PrototypeAvatarUniverse({ universe, art, catalog, currentAvatarId }: Props): React.JSX.Element {
  const { name, tagline, roster, folder } = UNIVERSES[universe];
  const [selectedId, setSelectedId] = React.useState(currentAvatarId);
  const byId = new Map(roster.map((portrait) => [portrait.id, portrait]));
  const selected = byId.get(selectedId) ?? roster[0];
  const entries = catalog.avatars.filter((entry) => byId.has(entry.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <span className="label-mono text-[11px] text-text-muted">UNIVERSE {universe}</span>
        <h2 className="font-display text-xl text-balance text-text-primary">{name}</h2>
        <p className="text-sm text-text-secondary">{tagline}</p>
      </div>

      {/* The chosen character large, plus how it reads in the header at real size */}
      <div className="flex items-center gap-4 rounded-md border border-border bg-surface p-4">
        <PortraitArtwork portrait={selected} folder={folder} art={art} size={120} />
        <div className="flex min-w-0 flex-col gap-2">
          <span className="font-display text-lg text-text-primary">{selected.name}</span>
          <span className="text-sm text-text-secondary">{selected.blurb}</span>
          <div className="flex items-center gap-2">
            <span className="label-mono text-[10px] text-text-muted">HEADER</span>
            <span className="flex items-center gap-2 rounded-full border border-border bg-base py-1 pr-3 pl-1">
              <PortraitArtwork portrait={selected} folder={folder} art={art} size={28} />
              <span className="label-mono text-[11px] text-text-primary">LVL {catalog.operator_level}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {entries.map((entry) => {
          const portrait = byId.get(entry.id) as Portrait;
          const isSelected = entry.id === selected.id;
          const isLocked = !entry.unlocked && !isSelected;
          return (
            <button
              key={entry.id}
              type="button"
              disabled={isLocked}
              onClick={() => setSelectedId(entry.id)}
              className={cn(
                "flex min-w-0 flex-col items-center gap-2 rounded-sm border px-2 py-3 text-center",
                isSelected && "border-cyan bg-cyan-dim",
                !isSelected && !isLocked && "border-border bg-elevated/40 hover:bg-elevated/70",
                isLocked && "cursor-not-allowed border-dashed border-border bg-base",
              )}
            >
              <PortraitArtwork portrait={portrait} folder={folder} art={art} size={80} locked={isLocked} />
              <span className={cn("text-[14px] font-medium break-words", isSelected ? "text-cyan" : "text-text-primary")}>
                {portrait.name}
              </span>
              {entry.unlocked ? null : (
                <span className="flex items-center gap-1 font-mono text-[11px] text-text-muted tabular-nums">
                  <Lock aria-hidden className="size-3" />
                  LVL {entry.current_level} / {entry.unlock_level}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="label-mono text-[10px] text-text-muted">PROTOTYPE · {art === "image" ? "generated portraits" : "drawn portraits"} · selection is a local preview, nothing is saved</p>
    </div>
  );
}
