"use client";

import { createContext, use, type AriaAttributes, type JSX, type ReactNode } from "react";

// What a `Field` knows and its control needs: the id the field’s `<label for>` points at, the
// ids of the hint and error text under it, and whether the field is in error (ADR-0107).
//
// This exists because the wiring used to be *inferred from position*:
// `Children.toArray(children)[0]` was "the control", and `cloneElement` pushed the id and the
// `aria-describedby` onto it. Wrapping the control in a layout div, rendering anything before
// it, or reordering the children moved that wiring onto the wrong element — and what broke was
// the label association, which no render-time error reports and no screen renders differently.
//
// So the field publishes and the control **claims**. Position stops mattering, and the claim
// is visible: a design-system primitive does it for you (ADR-0093 already routes every control
// through one), and anything else spreads `useFieldControl()` where it stands.

interface FieldControlValue {
  readonly id: string;
  // The hint and error ids, space-joined, or undefined where the field has neither.
  readonly describedBy: string | undefined;
  readonly invalid: boolean;
}

// Private: a control reaches its field through `useFieldControl`, and `Field` is what supplies
// it, so the context object itself is nobody else’s handle (the shape `SetEntry` uses, ADR-0106).
const FieldControlContext = createContext<FieldControlValue | null>(null);

// The three attributes a control may already declare, which the field merges with rather than
// overwrites.
export interface OwnControlProps {
  readonly id?: string;
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: AriaAttributes["aria-invalid"];
}

export interface FieldControlWiring {
  readonly id: string | undefined;
  readonly "aria-describedby": string | undefined;
  readonly "aria-invalid": AriaAttributes["aria-invalid"] | undefined;
}

export function FieldControlProvider({
  id,
  describedBy,
  invalid,
  children,
}: FieldControlValue & { children: ReactNode }): JSX.Element {
  // Deliberately not memoized. Nothing below is behind a `React.memo`, so a consumer
  // re-renders with the field whatever the value’s identity is, and a `useMemo` here would
  // read as saving renders while saving none (ADR-0091, and ADR-0105 for the same call).
  return (
    <FieldControlContext value={{ id, describedBy, invalid }}>{children}</FieldControlContext>
  );
}

// Split a control’s props into the enclosing field’s wiring and everything else, so a primitive
// makes the claim in one line instead of restating the three attribute names.
//
// Taking the whole props object rather than three destructured names is what makes the claim
// total: the three keys leave `rest` however they arrived — written at the call site or carried
// in by a spread — so the merged wiring is the only thing that can reach the element and a
// spread cannot quietly win over the field. Three primitives restating that destructure is the
// drift ADR-0106 is about, and nothing would have mechanized their agreement.
export function useFieldControlProps<P extends OwnControlProps>(
  props: P,
): readonly [FieldControlWiring, Omit<P, keyof OwnControlProps>] {
  const { id, "aria-describedby": describedBy, "aria-invalid": invalid, ...rest } = props;
  return [useFieldControl({ id, "aria-describedby": describedBy, "aria-invalid": invalid }), rest];
}

// Claim the enclosing field’s wiring, merged with whatever the control declares itself.
//
// Answers "nothing" outside a field rather than throwing, unlike `useSetEntry`: most controls
// in this app render outside a `Field` — a search box, a filter, a cell in a set row — so a
// primitive spreads this unconditionally and a field-less call site is unchanged. The failure
// a throw would catch is a field with *no* claimant, which is the opposite direction and is
// held statically instead (`lib/field-control-policy.ts`).
export function useFieldControl(own: OwnControlProps = {}): FieldControlWiring {
  const field = use(FieldControlContext);
  if (field === null) {
    return {
      id: own.id,
      "aria-describedby": own["aria-describedby"],
      "aria-invalid": own["aria-invalid"],
    };
  }
  return {
    // The field names the id, because its label is what points at it. A control naming a
    // second one would leave that label on nothing, so the guard refuses one rather than
    // letting this pick a winner.
    id: field.id,
    // The control’s own description comes first: the field’s hint and error are added to what
    // it already says, never in place of it.
    "aria-describedby":
      [own["aria-describedby"], field.describedBy].filter(Boolean).join(" ") || undefined,
    "aria-invalid": field.invalid ? true : own["aria-invalid"],
  };
}
