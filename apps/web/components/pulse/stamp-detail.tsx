import * as React from "react";
import Link from "next/link";
import { Lock, Trophy } from "@/components/pulse/icons";

import type { StampDetail } from "@/lib/passport-view";
import { SegmentedBar } from "@/components/pulse/segmented-bar";
import { Card } from "@/components/ui/card";

// The body of one Stamp's page (#652), pre-mapped by `toStampDetail`. An earned Stamp says
// when and, in plain words, what earned it, and links the Logged Session whose logging crossed
// the target. A locked Achievement opens too: it shows its criteria and live progress, and
// links nowhere, since no session has earned it. The icon is decorative; the text carries the
// meaning. No animation.
interface StampDetailBodyProps {
  detail: StampDetail;
}

export function StampDetailBody({ detail }: StampDetailBodyProps): React.JSX.Element {
  return detail.status === "earned" ? (
    <Card className="flex flex-col gap-4 border-cyan/30 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-cyan-dim text-cyan">
          <Trophy className="h-4 w-4" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {detail.earnedOn !== null ? (
            <span className="label-mono text-[11px] text-cyan">Earned {detail.earnedOn}</span>
          ) : null}
          <p className="break-words font-sans text-sm text-text-primary">{detail.explanation}</p>
        </div>
      </div>
      {/* The source record sits in History, a related place rather than a level deeper, so
          the link carries no navigation direction (ADR-0121). */}
      {detail.sourceHref !== null ? (
        <Link
          href={detail.sourceHref}
          className="label-mono self-start text-[11px] text-cyan hover:underline"
        >
          Open the logged session →
        </Link>
      ) : null}
    </Card>
  ) : (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-elevated text-text-muted">
          <Lock className="h-4 w-4" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="label-mono text-[11px] text-text-secondary">Not earned yet</span>
          <span className="break-words font-sans text-sm text-text-primary">
            {detail.criteria}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <SegmentedBar value={detail.fill} accent="blue" />
        <span className="label-mono text-[10px] text-text-secondary">{detail.progress}</span>
      </div>
    </Card>
  );
}
