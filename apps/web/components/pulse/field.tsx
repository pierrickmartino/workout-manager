import * as React from "react";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { FieldControlProvider } from "@/components/pulse/field-control";

interface FieldProps {
  label: React.ReactNode;
  // The id the label points at and the control claims. Omitted, the field generates one —
  // which is the usual case, since almost nothing else needs to name it.
  htmlFor?: string;
  // Optional helper text under the control.
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

// A labeled form field: mono micro-label above the control, with optional hint.
//
// The children are rendered as written, in any shape and any order. The field *publishes* the
// id, the description ids and the invalid state, and the control inside claims them — by being
// one of the design-system primitives, or by spreading `useFieldControl()` where it is not one
// (ADR-0107). So a control wrapped in a layout div, placed after another child or preceded by
// a conditional is wired exactly the same, and an auxiliary button beside it claims nothing.
//
// This used to read `children[0]` as the control and `cloneElement` the wiring onto it, which
// made all three of those shapes silently unlabel the field.
export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: FieldProps): React.JSX.Element {
  const generatedId = React.useId();
  const id = htmlFor ?? generatedId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <FieldControlProvider
      id={id}
      describedBy={[hintId, errorId].filter(Boolean).join(" ") || undefined}
      invalid={Boolean(error)}
    >
      <div className={cn("flex flex-col gap-2", className)}>
        <Label htmlFor={id}>{label}</Label>
        {children}
        {hint ? (
          <span id={hintId} className="font-mono text-[11px] text-text-muted">{hint}</span>
        ) : null}
        {error ? <span id={errorId} className="font-mono text-[11px] text-magenta">{error}</span> : null}
      </div>
    </FieldControlProvider>
  );
}

interface FieldLabelProps {
  label: string;
  // Composite controls each provide their own accessible name.
  group?: boolean;
  // The width the field asks for in a wrapping row — see `FIELD_WIDTH` (ADR-0087).
  className?: string;
  children: React.ReactNode;
}

// A compact inline label wrapper for dense grids (the Hand-Authored build-and-log editor and
// the Insert "Add exercise" editor): a mono micro-label above the control, tighter than the
// fuller `Field` block. Shared so the two prescription editors read identically.
export function FieldLabel({ label, children, group = false, className }: FieldLabelProps): React.JSX.Element {
  if (group) {
    return (
      <fieldset className={cn("min-w-0", className)}>
        <legend className="mb-1.5 font-mono text-[9px] text-text-muted">{label}</legend>
        {children}
      </fieldset>
    );
  }
  return (
    <Field
      className={cn("gap-1.5", className)}
      label={<span className="text-[9px] text-text-muted">{label}</span>}
    >
      {children}
    </Field>
  );
}
