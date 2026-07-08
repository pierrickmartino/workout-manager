import * as React from "react";

import type { OperatorLevel } from "@/lib/profile-progress-types";
import { SegmentedBar } from "@/components/pulse/segmented-bar";
import { Card } from "@/components/ui/card";

interface LevelBadgeProps {
  // The account's total XP and where it sits on the Operator Level curve.
  xp: number;
  level: OperatorLevel;
}

// The Operator Level badge (F5 Slice 2): the focal card of the Profile view. It reads
// the account-wide Operator Level as a single number over an XP progress bar into the
// current level ("LVL 12 · 760 XP → LEVEL 13"). The fill is the honest
// `xp_into_level / xp_span_of_level` ratio from the read model; a brand-new user with
// 0 XP renders as Level 1 with an empty bar. Distinct from the per-type Fitness Level —
// this is one account-wide number that measures investment, not ability (CONTEXT.md).
export function LevelBadge({ xp, level }: LevelBadgeProps): React.JSX.Element {
  // Guard the divide: the curve always spans a positive width, but never trust it to.
  const fill =
    level.xp_span_of_level > 0 ? level.xp_into_level / level.xp_span_of_level : 0;

  return (
    <Card className="flex flex-col gap-5 p-5">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-1.5">
          <span className="label-mono text-[11px] text-cyan">OPERATOR LEVEL</span>
          <span className="font-display text-5xl font-bold leading-none text-text-primary">
            LVL {level.level}
          </span>
        </div>
        <span className="label-mono text-[11px] text-text-secondary">
          {xp.toLocaleString()} XP
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <SegmentedBar value={fill} accent="cyan" />
        <div className="flex items-center justify-between">
          <span className="label-mono text-[10px] text-text-muted">
            {level.xp_into_level.toLocaleString()} /{" "}
            {level.xp_span_of_level.toLocaleString()} XP
          </span>
          <span className="label-mono text-[10px] text-text-secondary">
            {level.xp_to_next.toLocaleString()} XP → LVL {level.level + 1}
          </span>
        </div>
      </div>
    </Card>
  );
}
