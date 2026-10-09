import * as React from "react";
import { ChevronRight, Lock, Trophy } from "@/components/pulse/icons";

import type { Milestone, Passport, Stamp } from "@/lib/passport-view";
import { SectionHeader } from "@/components/pulse/section-header";
import { SegmentedBar } from "@/components/pulse/segmented-bar";
import { Card } from "@/components/ui/card";

// The Training Passport (ADR-0126): the user's Achievements presented as a collection of
// Stamps. Every piece is pre-mapped by `toPassport` — the ordering, the one next milestone
// and the "More to earn" remainder are all decided there — so these components only render,
// and the Profile summary and the full Passport page share them. Every Achievement is a
// read-time projection of the Logged record (ADR-0018). No animation: Stamps sit still.

// The earned Stamps, oldest first, so the collection reads as the story of the user's
// training. Each one is announced by its title and earned date; the icon is decorative.
export function PassportStamps({
  stamps,
}: {
  stamps: readonly Stamp[];
}): React.JSX.Element {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {stamps.map((stamp) => (
        <li key={stamp.id}>
          <Card className="flex h-full items-start gap-3 border-cyan/30 p-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-cyan-dim text-cyan">
              <Trophy className="h-4 w-4" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="break-words font-sans text-[14px] font-semibold text-text-primary">
                {stamp.name}
              </span>
              {stamp.earnedOn !== null ? (
                <span className="label-mono text-[10px] text-cyan">
                  Earned {stamp.earnedOn}
                </span>
              ) : null}
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

// The single locked Achievement closest to earned: what is within reach next, with its
// criteria and live progress.
export function NextMilestone({
  milestone,
}: {
  milestone: Milestone;
}): React.JSX.Element {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-elevated text-text-muted">
          <Lock className="h-4 w-4" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="break-words font-sans text-[14px] font-semibold text-text-primary">
            {milestone.name}
          </span>
          <span className="break-words font-sans text-[12px] text-text-secondary">
            {milestone.criteria}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <SegmentedBar value={milestone.fill} accent="blue" />
        <span className="label-mono text-[10px] text-text-secondary">
          {milestone.progress}
        </span>
      </div>
    </Card>
  );
}

interface MoreToEarnProps {
  milestones: readonly Milestone[];
  // Whether the disclosure starts open. The page leaves it closed; the reflow audit mounts
  // it open too, so both of its states are measured.
  defaultOpen?: boolean;
}

// Every other locked Achievement, behind a native disclosure so the Passport leads with what
// the user has done rather than a wall of locks. `<details>` is keyboard-operable as is.
export function MoreToEarn({
  milestones,
  defaultOpen = false,
}: MoreToEarnProps): React.JSX.Element {
  return (
    <details className="group" open={defaultOpen}>
      <summary
        className={
          "flex cursor-pointer list-none items-center gap-2 rounded-sm outline-none " +
          "[&::-webkit-details-marker]:hidden focus-visible:ring-2 focus-visible:ring-cyan " +
          "focus-visible:ring-offset-2 focus-visible:ring-offset-base"
        }
      >
        <ChevronRight
          className="h-3.5 w-3.5 shrink-0 text-cyan transition-transform group-open:rotate-90 motion-reduce:transition-none"
          aria-hidden
        />
        <span className="label-mono text-[11px] text-text-secondary transition-colors group-hover:text-cyan">
          More to earn ({milestones.length})
        </span>
      </summary>
      <ul className="mt-3 flex flex-col divide-y divide-border rounded-sm border border-border bg-surface">
        {milestones.map((milestone) => (
          <li key={milestone.id} className="flex flex-col gap-0.5 px-4 py-3">
            <span className="break-words font-sans text-[14px] font-semibold text-text-primary">
              {milestone.name}
            </span>
            <span className="break-words font-sans text-[12px] text-text-secondary">
              {milestone.criteria}
            </span>
            <span className="label-mono text-[10px] text-text-secondary">
              {milestone.progress}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

interface TrainingPassportProps {
  passport: Passport;
  // Passed to the "More to earn" disclosure; see `MoreToEarn`.
  moreToEarnOpen?: boolean;
}

// The full Passport page body: the earned Stamps, the next milestone, then the disclosure.
// Each part is omitted when the view-model has nothing for it, so a section is never empty.
export function TrainingPassport({
  passport,
  moreToEarnOpen = false,
}: TrainingPassportProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      {passport.stamps.length > 0 ? (
        <div className="flex flex-col gap-4">
          <SectionHeader>STAMPS</SectionHeader>
          <PassportStamps stamps={passport.stamps} />
        </div>
      ) : null}
      {passport.next !== null ? (
        <div className="flex flex-col gap-4">
          <SectionHeader>NEXT MILESTONE</SectionHeader>
          <NextMilestone milestone={passport.next} />
        </div>
      ) : null}
      {passport.moreToEarnCount > 0 ? (
        <MoreToEarn milestones={passport.moreToEarn} defaultOpen={moreToEarnOpen} />
      ) : null}
    </div>
  );
}
