import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { ProtocolProgress } from "@/lib/protocols-types";
import { queueView } from "@/lib/home-view";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface QueueListProps {
  protocol: ProtocolProgress;
}

// The Home Queue: the remaining upcoming un-performed Sessions of the Current
// Protocol, capped to a scannable few. Each row shows only honest, calendar-free
// facts — its Week/Day position, module count, and per-session duration — and the
// first is flagged NEXT. The one aggregate is the protocol-level `X / N`
// completion header; there is deliberately NO per-session percentage (ADR-0008:
// completion is binary per Session). When the cap trims the list, a "view all"
// affordance links to the Protocol detail. Renders nothing without a Next
// Session, so Home shows it only for a live Current Protocol.
export function QueueList({
  protocol,
}: QueueListProps): React.JSX.Element | null {
  const queue = queueView(protocol);
  if (!queue) return null;

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between">
        <span className="label-mono text-[11px] text-cyan">QUEUE // UP NEXT</span>
        <span className="label-mono text-[10px] text-text-secondary">
          {queue.header}
        </span>
      </div>

      <ol className="flex list-none flex-col gap-2.5 p-0">
        {queue.rows.map((row) => (
          <li key={row.sessionId}>
            <Link
              href={`/sessions/${row.sessionId}`}
              className={`flex items-center gap-3 rounded-md border p-3 transition-colors ${
                row.isNext
                  ? "border-cyan/60 bg-elevated"
                  : "border-border bg-surface hover:border-cyan/40"
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-sm font-mono text-[12px] font-bold ${
                  row.isNext ? "bg-cyan text-on-accent" : "bg-base text-cyan"
                }`}
              >
                {String(row.position).padStart(2, "0")}
              </span>
              <div className="flex flex-1 flex-col gap-0.5">
                <span className="font-display text-[14px] font-semibold text-text-primary">
                  {row.label}
                </span>
                <span className="label-mono text-[9px] text-text-muted">
                  {row.modules} EXERCISES &middot; {row.durationMinutes}M
                </span>
              </div>
              {row.isNext ? <Badge variant="cyan">NEXT</Badge> : null}
            </Link>
          </li>
        ))}
      </ol>

      {queue.hasMore ? (
        <Link
          href={`/protocols/${protocol.id}`}
          className="flex items-center justify-center gap-1.5 font-mono text-[12px] text-text-secondary transition-colors hover:text-cyan"
        >
          View all {queue.totalUpcoming} upcoming
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </Card>
  );
}
