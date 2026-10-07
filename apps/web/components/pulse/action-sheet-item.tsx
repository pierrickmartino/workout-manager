import { cn } from "@/lib/utils";

// The rows an `ActionSheet` holds (ADR-0113), in their own module with **no** `"use client"`
// directive, because a Server Component renders rows too: the Session detail page builds its
// "Generate another" row from these. Filed beside the sheet in its client module, the class helper
// was a client *reference* on the server, and calling it threw while every Session detail page
// rendered. Nothing here holds state, so nothing here needs the browser;
// `lib/client-boundary-policy.ts` keeps it that way.

// The rule between the safe actions and the destructive one, which always comes last.
export function ActionSheetSeparator(): React.JSX.Element {
  return <hr className="my-1 border-border" />;
}

// One row of the sheet: full-bleed, at least 52px tall, icon then label then an optional
// description. Every action renders its closed state with this, whatever element it is — a
// `button`, a submit inside the action's own form, or a `Link` — so they read as one list.
//
// A disabled row mutes its label and icon rather than fading the whole row: its description is
// the reason it is disabled, and a reason at half opacity is the one sentence the reader needs.
export function actionSheetItemClass(tone: "default" | "danger" = "default"): string {
  return cn(
    "flex min-h-13 w-full items-center gap-3 px-4 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan disabled:cursor-not-allowed disabled:text-text-muted disabled:hover:bg-transparent motion-reduce:transition-none",
    tone === "danger"
      ? "text-magenta hover:bg-magenta-dim"
      : "text-text-primary hover:bg-elevated",
  );
}

// The label and the description under it. The description is where a disabled action says why —
// a `title` tooltip never appears under a finger.
export function ActionSheetItemText({
  label,
  description,
}: {
  label: string;
  description?: string | null;
}): React.JSX.Element {
  return (
    <span className="flex min-w-0 flex-col">
      <span>{label}</span>
      {description ? (
        <span className="text-[12px] font-normal text-text-muted">{description}</span>
      ) : null}
    </span>
  );
}

// An inline editor or confirm an action opens in place of its row (a name field, a share link, a
// two-step Delete): the rows' inset, since the sheet's list itself is full-bleed. The editor keeps
// its own layout and adds this to it.
export const ACTION_SHEET_EDITOR = "px-4 py-3";
