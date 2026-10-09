import * as React from "react";
import Link from "next/link";
import { ChevronRight, Lock, Trophy } from "@/components/pulse/icons";

import type { Milestone, Passport, Stamp } from "@/lib/passport-view";
import { NAV_FORWARD } from "@/lib/nav-direction";
import { SectionHeader } from "@/components/pulse/section-header";
import { SegmentedBar } from "@/components/pulse/segmented-bar";
import { Card } from "@/components/ui/card";

// The Training Passport (ADR-0126): the user's Achievements presented as a collection of
// Stamps. Every piece is pre-mapped by `toPassport` — the ordering, the one next milestone
// and the "More to earn" remainder are all decided there — so these components only render,
// and the Profile summary and the full Passport page share them. Every Achievement is a
// read-time projection of the Logged record (ADR-0018). No animation: Stamps sit still.
//
// Every Stamp, the next milestone and each "More to earn" entry opens its own page, one level
// deeper, so each link slides forward (ADR-0121, #652). A hover moves the border, never a fill.
const ENTRY_LINK_CLASS =
  "group block h-full rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-base";

// The earned Stamps, oldest first, so the collection reads as the story of the user's
// training. Each one is announced by its title and earned date; the icon is decorative.
interface PassportStampsProps {
  stamps: readonly Stamp[];
}

function PassportStamps({ stamps }: PassportStampsProps): React.JSX.Element {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {stamps.map((stamp) => (
        <li key={stamp.id}>
          <Link {...NAV_FORWARD} href={stamp.href} className={ENTRY_LINK_CLASS}>
            <Card className="flex h-full items-start gap-3 border-cyan/30 p-4 transition-colors group-hover:border-cyan">
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
          </Link>
        </li>
      ))}
    </ul>
  );
}

// The Passport before anything is earned: one sentence saying how the collection starts and
// a link Home, where the next workout is — never a page of locks (#651). Home is a tab, so
// the link carries no navigation direction (ADR-0121).
function EmptyPassport(): React.JSX.Element {
  return (
    <Card className="flex flex-col items-start gap-3 p-4">
      <p className="font-sans text-sm text-text-secondary">
        Your passport is empty. Your first logged session earns its first stamp.
      </p>
      <Link href="/dashboard" className="label-mono text-[11px] text-cyan hover:underline">
        Go to Home →
      </Link>
    </Card>
  );
}

// The single locked Achievement closest to earned: what is within reach next, with its
// criteria and live progress.
interface NextMilestoneProps {
  milestone: Milestone;
}

function NextMilestone({ milestone }: NextMilestoneProps): React.JSX.Element {
  return (
    <Link {...NAV_FORWARD} href={milestone.href} className={ENTRY_LINK_CLASS}>
      <Card className="flex flex-col gap-3 p-4 transition-colors group-hover:border-cyan">
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
    </Link>
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
function MoreToEarn({
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
          <li key={milestone.id}>
            <Link
              {...NAV_FORWARD}
              href={milestone.href}
              className={
                "flex flex-col gap-0.5 px-4 py-3 outline-none focus-visible:ring-2 " +
                "focus-visible:ring-inset focus-visible:ring-cyan"
              }
            >
              <span className="break-words font-sans text-[14px] font-semibold text-text-primary">
                {milestone.name}
              </span>
              <span className="break-words font-sans text-[12px] text-text-secondary">
                {milestone.criteria}
              </span>
              <span className="label-mono text-[10px] text-text-secondary">
                {milestone.progress}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

interface PassportHighlightsProps {
  passport: Passport;
  // Where the two section headings sit in the page outline: 2 on the Passport page, 3 inside
  // the Profile's own TRAINING PASSPORT section (ADR-0094).
  headingLevel: 2 | 3;
}

// The earned Stamps, then the next milestone: the whole Profile summary, and the head of the
// Passport page. With nothing earned, the Stamps section holds the empty state instead; the
// next milestone is omitted once everything is earned, so a heading never opens an empty
// section.
export function PassportHighlights({
  passport,
  headingLevel,
}: PassportHighlightsProps): React.JSX.Element {
  return (
    <>
      <div className="flex flex-col gap-4">
        <SectionHeader level={headingLevel}>STAMPS</SectionHeader>
        {passport.empty ? <EmptyPassport /> : <PassportStamps stamps={passport.stamps} />}
      </div>
      {passport.next !== null ? (
        <div className="flex flex-col gap-4">
          <SectionHeader level={headingLevel}>NEXT MILESTONE</SectionHeader>
          <NextMilestone milestone={passport.next} />
        </div>
      ) : null}
    </>
  );
}

interface TrainingPassportProps {
  passport: Passport;
  // Passed to the "More to earn" disclosure; see `MoreToEarn`.
  moreToEarnOpen?: boolean;
}

// The full Passport page body: the highlights, then the "More to earn" disclosure.
export function TrainingPassport({
  passport,
  moreToEarnOpen = false,
}: TrainingPassportProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <PassportHighlights passport={passport} headingLevel={2} />
      {passport.moreToEarn.length > 0 ? (
        <MoreToEarn milestones={passport.moreToEarn} defaultOpen={moreToEarnOpen} />
      ) : null}
    </div>
  );
}
