import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";

import type { ProtocolProgress } from "@/lib/protocols-types";
import { heroStats } from "@/lib/home-view";
import { StatRow } from "@/components/pulse/stat-row";
import { WorkoutSigil } from "@/components/pulse/workout-sigil";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

interface SessionHeroProps {
  protocol: ProtocolProgress;
}

// The Home Session Hero: the focal card for a Current Protocol's Next Session.
// It surfaces the honestly-backed stat row — duration · modules · sets — and a
// primary "Start session" CTA that launches the live route for the Next Session
// (issue #91 — F2·S6), with a secondary link to the Session's detail page. No
// target-calorie and no single volume/tonnage number (ADR-0008).
export function SessionHero({ protocol }: SessionHeroProps): React.JSX.Element {
  const next = protocol.next_session;
  const stats = heroStats(protocol);
  const total = protocol.sessions.length;
  const position = protocol.completed_count + 1;
  const heading =
    next?.title ?? (next ? `Week ${next.week}` : protocol.training_type);

  return (
    <Card className="flex flex-col gap-5 p-5">
      <div className="flex items-center justify-between">
        <span className="label-mono text-[11px] text-cyan">
          CURRENT PROTOCOL // NEXT SESSION
        </span>
        <span className="label-mono text-[10px] text-text-secondary">
          {position} / {total}
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* The Workout Signature mark (CONTEXT: Workout Signature): the Next Session's
            recognizable sigil, keyed on its Session id so it matches the same Session's mark on
            My Sessions and its detail page. Falls back to the Protocol id when a Protocol has no
            Next Session (the heading is non-Session then too). */}
        <WorkoutSigil
          seedId={next?.session_id ?? protocol.id}
          exerciseCount={stats.modules}
          trainingType={protocol.training_type}
          size={60}
        />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="font-display text-2xl font-bold capitalize text-text-primary">
            {heading}
          </h2>
          <p className="label-mono text-[11px] capitalize text-text-secondary">
            {protocol.training_type} &middot; {protocol.objective}
          </p>
        </div>
      </div>

      <StatRow
        stats={[
          { label: "DURATION", value: `${stats.durationMinutes}m` },
          { label: "EXERCISES", value: stats.modules },
          { label: "SETS", value: stats.sets },
        ]}
      />

      {next ? (
        <div className="flex flex-col gap-2.5">
          <Link
            href={`/sessions/${next.session_id}/live`}
            className={buttonVariants({ className: "w-full" })}
          >
            <Play className="h-4 w-4" />
            Start session
          </Link>
          <Link
            href={`/sessions/${next.session_id}`}
            className={buttonVariants({
              variant: "secondary",
              className: "w-full",
            })}
          >
            View session
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
