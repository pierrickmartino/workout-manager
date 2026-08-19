import * as React from "react";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

interface FieldProps {
  label: React.ReactNode;
  htmlFor?: string;
  // Optional helper text under the control.
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

// A labeled form field: mono micro-label above the control, with optional hint.
// Wraps in a <label> when no htmlFor is given so the whole block stays clickable.
export function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: FieldProps): React.JSX.Element {
  const Wrapper = htmlFor ? "div" : "label";
  return (
    <Wrapper className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? (
        <span className="font-mono text-[11px] text-text-muted">{hint}</span>
      ) : null}
    </Wrapper>
  );
}

interface FieldLabelProps {
  label: string;
  children: React.ReactNode;
}

// A compact inline label wrapper for dense grids (the Hand-Authored build-and-log editor and
// the Insert "Add exercise" editor): a mono micro-label above the control, tighter than the
// fuller `Field` block. Shared so the two prescription editors read identically.
export function FieldLabel({ label, children }: FieldLabelProps): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label-mono text-[9px] text-text-muted">{label}</span>
      {children}
    </label>
  );
}
