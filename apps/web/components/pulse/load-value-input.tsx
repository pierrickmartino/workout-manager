import * as React from "react";

import { loadValueHint, loadValueInputMode } from "@/lib/load";
import type { WeightUnit } from "@/lib/weight-unit";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// The one Load value field (ADR-0114). One input serves all five Load kinds, so what it shows
// has to follow the kind picked beside it: the unit it is in, as a suffix inside the field that
// stays put while the value is typed — "kg", "%", or "+kg" for bodyweight, where the value is the
// added load — and a placeholder that says what an empty value means ("—" is no load, "0" is no
// added load). The keypad follows the kind too (ADR-0093). `lib/load-value-policy.ts` holds that
// no Load value field is written anywhere else.
//
// The suffix is `aria-hidden`: the kind picker's label already names the unit, so a screen
// reader would hear it twice.
//
// `density` is the box the field sits in: a captioned 44px form field, or a 36px cell in the
// Live Session set table, whose suffix shrinks with it.
export type LoadValueDensity = "field" | "cell";

export interface LoadValueInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "placeholder" | "inputMode" | "spellCheck"> {
  // The picked Load kind, as the raw picker string.
  readonly kind: string;
  readonly unit: WeightUnit;
  readonly density?: LoadValueDensity;
}

const SUFFIX: Record<LoadValueDensity, { readonly room: string; readonly text: string }> = {
  field: { room: "pr-11", text: "right-3 text-xs" },
  cell: { room: "pr-6", text: "right-1.5 text-[9px]" },
};

export function LoadValueInput({
  kind,
  unit,
  density = "field",
  className,
  ...props
}: LoadValueInputProps): React.JSX.Element {
  const hint = loadValueHint(kind, unit);
  const suffix = SUFFIX[density];
  return (
    <div className="relative min-w-0">
      <Input
        spellCheck={false}
        className={cn(className, hint.suffix ? suffix.room : null)}
        placeholder={hint.placeholder}
        inputMode={loadValueInputMode(kind)}
        {...props}
      />
      {hint.suffix ? (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1/2 -translate-y-1/2 font-mono text-text-muted",
            suffix.text,
          )}
        >
          {hint.suffix}
        </span>
      ) : null}
    </div>
  );
}
