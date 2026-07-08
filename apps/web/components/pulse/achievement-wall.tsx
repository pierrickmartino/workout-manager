import * as React from "react";
import { Lock, Trophy } from "lucide-react";

import type { AchievementCard } from "@/lib/achievements-view";
import { SegmentedBar } from "@/components/pulse/segmented-bar";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface AchievementWallProps {
  // Display cards from `toAchievementCards`, in curated catalog order.
  cards: readonly AchievementCard[];
}

// One badge tile: a Trophy for an unlocked Achievement (cyan, earned date) or a dimmed
// Lock for a still-locked one (live "current/target" progress under a partial meter).
function AchievementTile({ card }: { card: AchievementCard }): React.JSX.Element {
  const Icon = card.unlocked ? Trophy : Lock;
  return (
    <Card
      className={cn(
        "flex flex-col gap-3 p-4",
        card.unlocked ? "border-cyan/30" : "opacity-70",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-sm",
            card.unlocked
              ? "bg-cyan-dim text-cyan"
              : "bg-elevated text-text-muted",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="font-sans text-[14px] font-semibold text-text-primary">
            {card.name}
          </span>
          <span className="font-sans text-[12px] text-text-muted">
            {card.criteria}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <SegmentedBar
          value={card.fill}
          accent={card.unlocked ? "cyan" : "blue"}
          className={card.unlocked ? undefined : "opacity-60"}
        />
        <span
          className={cn(
            "label-mono text-[10px]",
            card.unlocked ? "text-cyan" : "text-text-muted",
          )}
        >
          {card.unlocked ? `EARNED ${card.progress}` : card.progress}
        </span>
      </div>
    </Card>
  );
}

// The Achievement wall (F5 Slice 3): the grid of curated, type-neutral milestone badges
// on the Profile screen. Unlocked badges show the date earned; locked badges show their
// criteria and live progress toward the target. Every badge is a read-time projection of
// the Logged record (ADR-0018), so an all-locked wall is the honest brand-new-user state,
// never an error. The `cards` are pre-mapped by `toAchievementCards`; this component only
// renders, so both the compact Profile summary and the full "see all" page share it.
export function AchievementWall({ cards }: AchievementWallProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {cards.map((card) => (
        <AchievementTile key={card.id} card={card} />
      ))}
    </div>
  );
}
