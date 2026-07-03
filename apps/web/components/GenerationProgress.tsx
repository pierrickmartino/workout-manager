import { Loader2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Overline } from "@/components/pulse/overline";

// The loading/progress indicator shown while a Protocol generation runs off the
// request path. It is an accessible live region with an indeterminate progress
// bar; the reassurance copy reflects that the worker completes the job server-side
// even if the mobile connection drops (Slice 7, ADR-0005).
export function GenerationProgress() {
  return (
    <Card
      role="status"
      aria-live="polite"
      className="flex flex-col gap-4 p-6"
    >
      <div className="flex items-center gap-2.5">
        <Loader2 className="h-4 w-4 animate-spin text-cyan" aria-hidden />
        <Overline>GENERATING PROTOCOL…</Overline>
      </div>

      <p className="font-display text-lg font-semibold text-text-primary">
        Building your multi-week plan
      </p>

      {/* Indeterminate track: a cyan segment sweeps across the elevated bar. */}
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-elevated"
        aria-label="Generating protocol"
      >
        <div className="h-full w-1/3 animate-[pulse-sweep_1.4s_ease-in-out_infinite] rounded-full bg-cyan" />
      </div>

      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        You can keep this page open — generation continues on our side even if
        your connection drops, and your protocol will be waiting when it&apos;s
        done.
      </p>
    </Card>
  );
}
