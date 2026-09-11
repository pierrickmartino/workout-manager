import Link from "next/link";
import {
  ClipboardCheck,
  ListChecks,
  PencilRuler,
  Play,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import type { QuickAction, QuickActionKey } from "@/lib/quick-actions";

interface QuickActionsProps {
  actions: QuickAction[];
}

// The icon for each quick action, keyed by its stable identity. Kept in the component
// (presentation), not the view-model (docs/redesign-ia.md, ADR-0071).
const ICONS: Record<QuickActionKey, LucideIcon> = {
  start: Play,
  build: PencilRuler,
  log: ClipboardCheck,
  sessions: ListChecks,
};

// Home's persistent quick-action row: the launch shortcuts for the recurring core intents
// (Start next / Build / Log / My sessions). Rendered in BOTH the active-protocol and empty
// states so a self-managed user is never stranded (docs/redesign-ia.md). "Start next" — the
// I1 ≤1-tap verb — leads as a full-width primary button when present; the hand-made intents
// fill a two-column grid beneath it, the last cell widened when the count is odd so the row
// never leaves a lone half-width button.
export function QuickActions({ actions }: QuickActionsProps): React.JSX.Element {
  const primary = actions.find((action) => action.primary);
  const rest = actions.filter((action) => !action.primary);
  const PrimaryIcon = primary ? ICONS[primary.key] : null;

  return (
    <div className="flex flex-col gap-2.5">
      {primary && PrimaryIcon ? (
        <Link
          href={primary.href}
          className={buttonVariants({ className: "w-full" })}
        >
          <PrimaryIcon className="h-4 w-4" aria-hidden />
          {primary.label}
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5">
        {rest.map((action, index) => {
          const Icon = ICONS[action.key];
          // Widen the final cell to a full row when an odd count would otherwise
          // leave it stranded at half width.
          const isLoneLast = index === rest.length - 1 && rest.length % 2 === 1;
          return (
            <Link
              key={action.key}
              href={action.href}
              className={buttonVariants({
                variant: "secondary",
                className: cn(isLoneLast && "col-span-2"),
              })}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {action.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
