import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";

import type { ProtocolProgress } from "@/lib/protocols-types";
import {
  trainingRoute,
  type RouteStop,
  type RouteWeek,
} from "@/lib/home-view";
import { Overline } from "@/components/pulse/overline";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface TrainingRouteCardProps {
  protocol: ProtocolProgress;
}

// The training route: the Current Protocol as a compact, mobile, vertical route
// of NAMED stops (a Session's title, e.g. "Upper A"), adapted from Aceternity's
// Timeline. It replaces the old ambiguous dots: a completed stop gets a solid
// marker, the Next Session a clearly-labeled outline, and later stops stay
// readable. The current week shows up front; a `<details>` disclosure reveals the
// full plan — an EXPLICIT control, so scroll position never stands in for
// completion. Read-oriented navigation: each stop links to its Session detail; the
// primary "Start session" CTA stays unique to the Session Hero above. Positional
// only — no calendar dates, so no rest/missed distinction exists to draw
// (ADR-0001/0008). Renders nothing without a Next Session, so Home shows it only
// for a live Current Protocol.
export function TrainingRouteCard({
  protocol,
}: TrainingRouteCardProps): React.JSX.Element | null {
  const route = trainingRoute(protocol);
  if (!route) return null;

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <Overline>{route.weekLabel}</Overline>
        {/* The two figures kept explicitly apart: sequence position vs performed
            count — never the single ambiguous number the dots implied. */}
        <span className="label-mono shrink-0 text-[10px] text-text-secondary">
          Session {route.position} of {route.total} &middot; {route.completedCount}{" "}
          done
        </span>
      </div>

      <StopList stops={route.currentWeek.stops} />

      {route.weeks.length > 1 ? (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 pt-1 [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-3.5 w-3.5 text-cyan transition-transform group-open:rotate-90" />
            <span className="label-mono text-[11px] text-text-secondary transition-colors group-hover:text-cyan">
              Full plan &middot; {route.totalWeeks} weeks
            </span>
          </summary>
          <div className="mt-4 flex flex-col gap-5">
            {route.weeks.map((week) => (
              <WeekBlock key={week.week} week={week} />
            ))}
          </div>
        </details>
      ) : null}
    </Card>
  );
}

// One week inside the expandable full plan: a divider carrying the week number
// (the current week flagged) and its binary X/total completion, then the week's
// stops as the same route rows used up front.
function WeekBlock({ week }: { week: RouteWeek }): React.JSX.Element {
  const done = week.stops.filter((stop) => stop.state === "done").length;
  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <span
          className={cn(
            "label-mono shrink-0 text-[10px]",
            week.isCurrent ? "text-cyan" : "text-text-muted",
          )}
        >
          Week {week.week}
          {week.isCurrent ? " · this week" : ""}
        </span>
        <span className="h-px flex-1 bg-border" />
        <span className="label-mono shrink-0 text-[9px] text-text-muted">
          {done}/{week.stops.length}
        </span>
      </div>
      <StopList stops={week.stops} />
    </div>
  );
}

// The vertical route rail: the ordered stops joined by a connecting line, the
// segment above a completed stop drawn in accent so progress reads at a glance.
function StopList({ stops }: { stops: RouteStop[] }): React.JSX.Element {
  return (
    <ol className="flex list-none flex-col p-0">
      {stops.map((stop, index) => (
        <StopRow
          key={stop.sessionId}
          stop={stop}
          isLast={index === stops.length - 1}
        />
      ))}
    </ol>
  );
}

function StopRow({
  stop,
  isLast,
}: {
  stop: RouteStop;
  isLast: boolean;
}): React.JSX.Element {
  return (
    <li className="flex gap-3">
      {/* Rail: the marker node plus the connecting line to the next stop. */}
      <div className="flex flex-col items-center">
        <StopNode state={stop.state} />
        {isLast ? null : (
          <span
            className={cn(
              "w-px flex-1",
              stop.state === "done" ? "bg-cyan" : "bg-border-lite",
            )}
          />
        )}
      </div>

      <Link
        href={`/sessions/${stop.sessionId}`}
        aria-current={stop.state === "next" ? "step" : undefined}
        className="group/stop -mt-1 mb-3 flex flex-1 items-center gap-2"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "truncate font-display text-sm font-semibold capitalize",
                stop.state === "upcoming"
                  ? "font-medium text-text-secondary"
                  : "text-text-primary",
              )}
            >
              {stop.title}
            </span>
            {stop.state === "next" ? <Badge variant="cyan">NEXT</Badge> : null}
          </div>
          <span className="label-mono text-[9px] text-text-muted">
            Session {stop.position} &middot; Week {stop.week} &middot; Day{" "}
            {stop.day}
          </span>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-text-muted transition-colors group-hover/stop:text-cyan" />
      </Link>
    </li>
  );
}

// The stop marker: a solid cyan node with a check for a performed stop, a hollow
// ringed outline for the Next Session, and a quiet readable outline for an
// upcoming one.
function StopNode({ state }: { state: RouteStop["state"] }): React.JSX.Element {
  return (
    <span
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
        state === "done" && "bg-cyan text-on-accent",
        state === "next" && "border-2 border-cyan bg-base ring-4 ring-cyan/20",
        state === "upcoming" && "border border-border-lite bg-base",
      )}
    >
      {state === "done" ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
    </span>
  );
}
