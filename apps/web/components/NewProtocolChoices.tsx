import Link from "next/link";

import { cn } from "@/lib/utils";
import type { NewProtocolChoice } from "@/lib/curated-protocol-view";

interface NewProtocolChoicesProps {
  choices: NewProtocolChoice[];
}

// The peer choice at the new-Protocol entry point (ADR-0130): "Generate for me" beside
// "Choose a Curated Protocol". The two are siblings, not a drill-down, so the links carry no
// navigation direction. Renders nothing when there is only one way to get a Protocol.
export function NewProtocolChoices({
  choices,
}: NewProtocolChoicesProps): React.JSX.Element | null {
  if (choices.length < 2) return null;
  return (
    <nav aria-label="How to make your protocol" className="flex flex-wrap gap-2">
      {choices.map((choice) => (
        <Link
          key={choice.href}
          href={choice.href}
          aria-current={choice.current ? "page" : undefined}
          className={cn(
            "label-mono rounded-full border px-4 py-2 text-[11px] transition-colors",
            choice.current
              ? "border-cyan bg-cyan-dim text-cyan"
              : "border-border text-text-secondary hover:border-cyan",
          )}
        >
          {choice.label}
        </Link>
      ))}
    </nav>
  );
}
