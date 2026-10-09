"use client";

import Link from "next/link";
import { useId } from "react";

import { NAV_FORWARD } from "@/lib/nav-direction";
import type { BlockedRowActionView } from "@/lib/protocols-index";

interface BlockedRowActionProps {
  // The visible verb ("Switch", "Delete") and the accessible name naming the row.
  children: string;
  label: string;
  // The view-model's blocked verdict: the reason and the way back to the Live Session.
  blocked: BlockedRowActionView;
  className: string;
}

// A Protocols-index row action blocked by a Live Session in progress (issues #638, #639). An
// `aria-disabled` button rather than a `disabled` one, so it stays focusable and a screen reader
// announces it as unavailable with the reason attached through `aria-describedby`. The reason is
// also visible, with a way back to the Live Session beside it rather than inside the description.
export function BlockedRowAction({
  children,
  label,
  blocked,
  className,
}: BlockedRowActionProps): React.JSX.Element {
  const reasonId = useId();
  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        aria-disabled="true"
        aria-label={label}
        aria-describedby={reasonId}
        className={`${className} cursor-not-allowed text-text-muted hover:bg-surface`}
      >
        {children}
      </button>
      <p id={reasonId} className="font-mono text-[12px] leading-relaxed text-text-secondary">
        {blocked.reason}
      </p>
      <Link
        {...NAV_FORWARD}
        href={blocked.resumeHref}
        className="font-mono text-[12px] text-cyan hover:underline"
      >
        Resume session
      </Link>
    </div>
  );
}
