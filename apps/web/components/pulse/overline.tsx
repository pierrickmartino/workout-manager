import * as React from "react";

import { cn } from "@/lib/utils";

// The cyan mono overline that sits above every screen title in pulse.pen —
// e.g. "PULSE // DASHBOARD", "PULSE // OPERATOR", "REGISTER OPERATOR".
export function Overline({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>): React.JSX.Element {
  return (
    <p
      className={cn(
        "label-mono text-[11px] font-normal tracking-[0.14em] text-cyan",
        className,
      )}
      {...props}
    />
  );
}
