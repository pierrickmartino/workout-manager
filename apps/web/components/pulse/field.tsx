import * as React from "react";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

interface FieldProps {
  label: React.ReactNode;
  htmlFor?: string;
  // Optional helper text under the control.
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

// A labeled form field: mono micro-label above the control, with optional hint.
// The first child is the control; subsequent children may be auxiliary buttons.
export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: FieldProps): React.JSX.Element {
  const generatedId = React.useId();
  const items = React.Children.toArray(children);
  const control = items[0] as React.ReactElement<React.HTMLAttributes<HTMLElement>>;
  const id = htmlFor ?? control.props.id ?? generatedId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [control.props["aria-describedby"], hintId, errorId].filter(Boolean).join(" ");
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {React.cloneElement(control, {
        id,
        "aria-describedby": describedBy || undefined,
        "aria-invalid": error ? true : control.props["aria-invalid"],
      })}
      {items.slice(1)}
      {hint ? (
        <span id={hintId} className="font-mono text-[11px] text-text-muted">{hint}</span>
      ) : null}
      {error ? <span id={errorId} className="font-mono text-[11px] text-magenta">{error}</span> : null}
    </div>
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
    <Field className="gap-1.5" label={<span className="text-[9px] text-text-muted">{label}</span>}>
      {children}
    </Field>
  );
}
