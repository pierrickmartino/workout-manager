import type { ProtocolProgress } from "@/lib/protocols-types";
import { weekStrip, type WeekCellState } from "@/lib/home-view";
import { Overline } from "@/components/pulse/overline";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface WeekCycleStripProps {
  protocol: ProtocolProgress;
}

// How each Session cell reads inside its week pill. Purely positional — done /
// active / upcoming — with no weekday or date semantics (ADR-0008): a bright cyan
// cell for the active Next Session, a dimmed fill for a performed (done) Session,
// and a hollow ring for an upcoming one.
const CELL_STYLES: Record<WeekCellState, string> = {
  done: "h-2 w-2 bg-cyan/50",
  active: "h-2.5 w-2.5 bg-cyan",
  upcoming: "h-2 w-2 border border-border bg-transparent",
};

// The Home completion map: one rounded, segmented pill per week across the whole
// Current Protocol, each pill carrying one cell per Session (done / active /
// upcoming), with a `WEEK n/total` overline. Past weeks read as filled pills, the
// current week's pill takes an accent ring with its Next Session cell brightest,
// and future weeks read as hollow — so the strip answers "how far am I through the
// Protocol, and what is left?" (ADR-0009). Pills wrap so every week stays visible
// at once. Read-only: all navigation lives in the Queue. Renders nothing when the
// Protocol has no Next Session, so Home only shows it for a live Current Protocol.
export function WeekCycleStrip({
  protocol,
}: WeekCycleStripProps): React.JSX.Element | null {
  const strip = weekStrip(protocol);
  if (!strip) return null;

  return (
    <Card className="flex flex-col gap-3.5 p-5">
      <Overline>{strip.label}</Overline>
      <ul className="flex flex-wrap gap-2" aria-label={strip.label}>
        {strip.weeks.map((week) => (
          <li key={week.week}>
            <ul
              aria-label={`Week ${week.week}`}
              className={cn(
                "flex items-center gap-1 rounded-full border px-1.5 py-1",
                week.isCurrent
                  ? "border-cyan ring-2 ring-cyan/25"
                  : "border-border",
              )}
            >
              {week.cells.map((cell) => (
                <li
                  key={cell.sessionId}
                  aria-label={`Session ${cell.position}: ${cell.state}`}
                  aria-current={cell.state === "active" ? "step" : undefined}
                  className={cn("shrink-0 rounded-full", CELL_STYLES[cell.state])}
                />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Card>
  );
}
