import Link from "next/link";
import { ArrowRight, Zap } from "lucide-react";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

interface GenerateTrainingLaunchpadProps {
  // The mono eyebrow above the heading — differs by context ("no active protocol"
  // on the Home empty state, a neutral "start new training" on the TRAIN tab).
  eyebrow: string;
}

// The two ways to start new training: a full multi-week Protocol, or a standalone
// workout. Shared by the Home empty state and the TRAIN launchpad so the protocol
// entry point is reachable whether or not a Current Protocol exists (ADR-0037) — it
// was previously only on the Home empty state, stranding users mid-Protocol.
export function GenerateTrainingLaunchpad({
  eyebrow,
}: GenerateTrainingLaunchpadProps): React.JSX.Element {
  return (
    <Card className="flex flex-col gap-5 p-5">
      <span className="label-mono text-[11px] text-cyan">{eyebrow}</span>
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-2xl font-bold text-text-primary">
          Generate training
        </h2>
        <p className="label-mono text-[11px] text-text-secondary">
          AI PROTOCOLS &middot; STANDALONE SESSIONS
        </p>
      </div>
      <div className="flex flex-col gap-2.5">
        <Link
          href="/protocols/new"
          className={buttonVariants({ className: "w-full" })}
        >
          <Zap className="h-4 w-4" />
          Generate a protocol
        </Link>
        <Link
          href="/sessions/new"
          className={buttonVariants({
            variant: "secondary",
            className: "w-full",
          })}
        >
          Generate a workout
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </Card>
  );
}
