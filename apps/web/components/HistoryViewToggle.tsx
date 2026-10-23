import type { HistoryView } from "@/lib/history-filter";
import { cn } from "@/lib/utils";

// The List / Month view switch (ADR-0138): two pressed-state buttons, like the Training Type
// chips beside it. List is the default; the choice is part of the URL.
const VIEW_OPTIONS: readonly { value: HistoryView; label: string }[] = [
  { value: "list", label: "List" },
  { value: "month", label: "Month view" },
];

export function HistoryViewToggle({
  view,
  onChange,
}: {
  view: HistoryView;
  onChange: (view: HistoryView) => void;
}): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label="History layout"
      className="grid grid-cols-2 gap-1 self-start rounded-full border border-border p-1"
    >
      {VIEW_OPTIONS.map((option) => {
        const on = option.value === view;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.value)}
            className={cn(
              "label-mono rounded-full px-3 py-1.5 text-center text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 motion-reduce:transition-none",
              on ? "bg-cyan-dim text-cyan" : "text-text-secondary hover:text-cyan",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
