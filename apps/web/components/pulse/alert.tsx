import * as React from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { cn } from "@/lib/utils";

type Tone = "error" | "success" | "info";

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  // Opt in for messages that appear after an interaction or asynchronous result.
  announce?: boolean;
}

const TONE: Record<Tone, { wrap: string; icon: React.ElementType }> = {
  error: { wrap: "border-magenta/40 bg-magenta-dim text-magenta", icon: AlertTriangle },
  success: { wrap: "border-cyan/40 bg-cyan-dim text-cyan", icon: CheckCircle2 },
  info: { wrap: "border-border bg-surface text-text-secondary", icon: Info },
};

// Inline feedback. Static messages stay quiet; dynamic results opt into announcements.
export function Alert({
  tone = "info",
  announce = false,
  className,
  children,
  ...props
}: AlertProps): React.JSX.Element {
  const { wrap, icon: Icon } = TONE[tone];
  return (
    <div
      role={announce ? (tone === "error" ? "alert" : "status") : undefined}
      className={cn(
        "flex items-start gap-2.5 rounded-sm border px-3.5 py-3 text-sm",
        wrap,
        className,
      )}
      {...props}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="font-mono text-[13px] leading-relaxed">{children}</div>
    </div>
  );
}
