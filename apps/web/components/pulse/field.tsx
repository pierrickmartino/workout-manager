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

// The ask both compact wrappers take. Which one a call site renders is the decision, so the
// shape is shared and the choice is the component name (ADR-0108).
interface CompactFieldProps {
  label: string;
  // The width the field asks for in a wrapping row — see `FIELD_WIDTH` (ADR-0087).
  className?: string;
  children: React.ReactNode;
}

// A compact inline label wrapper for dense grids (the Hand-Authored build-and-log editor and
// the Insert "Add exercise" editor): a mono micro-label above the control, tighter than the
// fuller `Field` block. Shared so the two prescription editors read identically.
//
// One control, which claims the field's id the usual way (ADR-0107). For a composite —
// several controls under one caption — render `FieldGroup`.
export function FieldLabel({ label, children, className }: CompactFieldProps): React.JSX.Element {
  return (
    <Field
      className={cn("gap-1.5", className)}
      label={<span className="text-[9px] text-text-muted">{label}</span>}
    >
      {children}
    </Field>
  );
}

// The same micro-label over a *composite* control: several inputs under one caption, as
// ADR-0032's distance-and-time pair is. There is no single element for a `<label for>` to point
// at, so this is a `<fieldset>` and `<legend>` naming the group, and each control inside carries
// its own accessible name. It publishes no field wiring — nothing here claims an id.
//
// This used to be `FieldLabel({ group })`, one flag selecting between two renderings that share
// no markup and no a11y semantics (ADR-0108).
//
// `min-w-0` because the UA stylesheet floors every fieldset at its content's minimum width, and
// `border-0 p-0` does not override it (ADR-0085).
export function FieldGroup({ label, children, className }: CompactFieldProps): React.JSX.Element {
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="mb-1.5 font-mono text-[9px] text-text-muted">{label}</legend>
      {children}
    </fieldset>
  );
}
