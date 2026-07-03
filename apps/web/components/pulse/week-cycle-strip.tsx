import type { ProtocolProgress } from "@/lib/protocols-types";
import { weekStrip, type WeekDotState } from "@/lib/home-view";
import { Overline } from "@/components/pulse/overline";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface WeekCycleStripProps {
  protocol: ProtocolProgress;
}

// How each dot state reads. Purely positional — done / active / upcoming — with
// no weekday or date semantics (ADR-0008): a filled cyan dot for the active Next
// Session (with a soft ring), a dimmed fill for done, and a hollow ring for
// upcoming.
const DOT_STYLES: Record<WeekDotState, string> = {
  done: "h-2.5 w-2.5 bg-cyan/50",
  active: "h-3 w-3 bg-cyan ring-4 ring-cyan/20",
  upcoming: "h-2.5 w-2.5 border border-border bg-transparent",
};

// The Home Week Cycle strip: reinterprets Pulse's Monday–Sunday day dots onto the
// self-paced model as a position indicator over the current week's Sessions (the
// week of the Next Session), with a `WEEK n/total` overline. Renders nothing when
// the Protocol has no Next Session, so Home only shows it for a live Current
// Protocol.
export function WeekCycleStrip({
  protocol,
}: WeekCycleStripProps): React.JSX.Element | null {
  const strip = weekStrip(protocol);
  if (!strip) return null;

  return (
    <Card className="flex flex-col gap-3.5 p-5">
      <Overline>{strip.label}</Overline>
      <ul className="flex items-center gap-2.5" aria-label={strip.label}>
        {strip.dots.map((dot) => (
          <li
            key={dot.sessionId}
            aria-label={`Session ${dot.position}: ${dot.state}`}
            aria-current={dot.state === "active" ? "step" : undefined}
            className={cn("shrink-0 rounded-full", DOT_STYLES[dot.state])}
          />
        ))}
      </ul>
    </Card>
  );
}
