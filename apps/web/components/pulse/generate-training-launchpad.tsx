import Link from "next/link";
import {
  ArrowRight,
  ClipboardCheck,
  PencilLine,
  PencilRuler,
  Zap,
} from "@/components/pulse/icons";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { appendFrom } from "@/lib/back-target";
import {
  GENERATE_PROTOCOL_CHOICE,
  launchpadHeading,
  type ProtocolChoice,
} from "@/lib/curated-protocol-view";
import { NAV_FORWARD } from "@/lib/nav-direction";

interface GenerateTrainingLaunchpadProps {
  // The mono eyebrow above the heading — differs by context ("no active protocol"
  // on the Home empty state, a neutral "start new training" on the TRAIN tab).
  eyebrow: string;
  // The route this launchpad is rendered on ("/dashboard" or "/train"), threaded
  // onto the "Generate a workout" link as `?from=` so that screen's back control
  // returns here rather than defaulting to the Dashboard. Omitted → Dashboard fallback.
  from?: string;
  // The ways to get a new Protocol, each a primary CTA of equal weight. Home's empty state
  // passes "Generate for me" beside "Choose a Curated Protocol" once one is released
  // (`homeProtocolChoices`, ADR-0130). Omitted → the one "Generate a protocol" link.
  protocolChoices?: readonly ProtocolChoice[];
  // Extra entry points, rendered after the protocol and workout links in the same stack.
  // The TRAIN launchpad composes `BuildWorkoutLink` and `LogPastWorkoutLink` here; the
  // Home empty state composes nothing, since Home's quick-action row already carries
  // Build and Log (ADR-0071). This used to be a `showBuild` /
  // `showLogPastWorkout` pair — two flags describing four states, of which two were ever
  // rendered (composition audit #5, ADR-0109).
  children?: React.ReactNode;
}

// Every link in the stack below the primary protocol CTAs: a full-width secondary button.
// Named once because the two generation links and both composable cards ask for it, and a
// card that disagreed with its neighbours would read as a different kind of thing.
const LAUNCH_LINK = buttonVariants({ variant: "secondary", className: "w-full" });

const PROTOCOL_CHOICE_ICON = {
  generate: Zap,
  curated: ClipboardCheck,
} as const satisfies Record<ProtocolChoice["surface"], unknown>;

// The two ways to start new training: a full multi-week Protocol, or a standalone
// workout. Shared by the Home empty state and the TRAIN launchpad so the protocol
// entry point is reachable whether or not a Current Protocol exists (ADR-0037) — it
// was previously only on the Home empty state, stranding users mid-Protocol.
export function GenerateTrainingLaunchpad({
  eyebrow,
  from,
  protocolChoices = [GENERATE_PROTOCOL_CHOICE],
  children,
}: GenerateTrainingLaunchpadProps): React.JSX.Element {
  const heading = launchpadHeading(protocolChoices);
  return (
    <Card className="flex flex-col gap-5 p-5">
      <span className="label-mono text-[11px] text-cyan">{eyebrow}</span>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-balance font-display text-2xl font-bold text-text-primary">
          {heading.title}
        </h2>
        <p className="label-mono text-[11px] text-text-secondary">
          {heading.overline}
        </p>
      </div>
      <div className="flex flex-col gap-2.5">
        {protocolChoices.map((choice) => {
          const Icon = PROTOCOL_CHOICE_ICON[choice.surface];
          return (
            <Link
              key={choice.href}
              href={choice.href}
              {...NAV_FORWARD}
              className={buttonVariants({ className: "w-full" })}
            >
              <Icon className="h-4 w-4" />
              {choice.label}
            </Link>
          );
        })}
        <Link href={appendFrom("/sessions/new", from)} {...NAV_FORWARD} className={LAUNCH_LINK}>
          Generate a workout
          <ArrowRight className="h-4 w-4" />
        </Link>
        {children}
      </div>
    </Card>
  );
}

// The no-AI "Build a workout" card — author a reusable Hand-Authored Session to run later,
// no performance logged (intent I4, ADR-0071). A sibling of the generation links rather than
// a prop on them, so the caller that offers it says so by rendering it.
export function BuildWorkoutLink(): React.JSX.Element {
  return (
    <Link href="/sessions/build" {...NAV_FORWARD} className={LAUNCH_LINK}>
      <PencilRuler className="h-4 w-4" />
      Build a workout
    </Link>
  );
}

// The no-AI "Log a past workout" card — a Hand-Authored Session recording a workout already
// performed (ADR-0040).
export function LogPastWorkoutLink(): React.JSX.Element {
  return (
    <Link href="/sessions/log" {...NAV_FORWARD} className={LAUNCH_LINK}>
      <PencilLine className="h-4 w-4" />
      Log a past workout
    </Link>
  );
}
