import { MoreHorizontal } from "lucide-react";

interface OverflowMenuProps {
  children: React.ReactNode;
  // Accessible label for the trigger; also its visible text beside the icon.
  label?: string;
}

// A progressive-disclosure container for a page's rare / destructive actions
// (docs/redesign-ia.md, ADR-0071). Rather than a floating dropdown — which would clip the
// inline editors these controls expand into (Rename, Share, Delete confirm) — it uses a
// native <details>/<summary> disclosure: the "⋯ More" trigger toggles a bordered panel that
// stacks its children in normal flow. Native means keyboard- and screen-reader-accessible
// with no JS, so this stays a server component even though its children are interactive.
// Callers should render it only when it would hold at least one action.
export function OverflowMenu({
  children,
  label = "More actions",
}: OverflowMenuProps): React.JSX.Element {
  return (
    <details className="group w-full">
      <summary
        className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-sm border border-border bg-surface px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-elevated/50 [&::-webkit-details-marker]:hidden"
        aria-label={label}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
        {label}
      </summary>
      <div className="mt-2 flex flex-col items-start gap-3 rounded-md border border-border bg-surface p-3">
        {children}
      </div>
    </details>
  );
}
