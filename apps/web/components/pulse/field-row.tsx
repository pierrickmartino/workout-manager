import * as React from "react";

import { cn } from "@/lib/utils";

// A dense row of form fields that **stacks when its fields no longer fit** (ADR-0087).
//
// These rows used to be grids with `rem`-sized tracks — `grid-cols-[7rem_1fr]`. A `rem` track
// keeps its font-relative size while the viewport keeps its pixels, so at 200% text that 7rem
// column is 224px inside a 320px screen and the row overflows the document however well its
// contents shrink. A breakpoint is no remedy either: Tailwind's `sm:` is 40rem, so a `sm:`
// variant stacks on every phone at 100% text as well.
//
// So the break is **driven by the fields' own widths, not by a screen size**. Each field states
// the width it asks for as a flex basis; the row keeps them side by side while those asks fit
// and wraps when they do not. At 320px and 100% text the asks fit exactly as the tracks did, so
// the phone layout is unchanged; at 200% text, where one 5rem field is already wider than the
// whole row, every row stacks and each field gets the full width.
//
// `min-w-0` on each field is what lets an input narrower than its own padding still render
// rather than push the line out — the same escape hatch ADR-0085 puts on a `<fieldset>`.

interface FieldRowProps {
  className?: string;
  children: React.ReactNode;
}

// `min-w-0` on the row itself, not only on its fields: a row nested inside another row (an
// amount block beside its RPE picker) is a field too, and has to be able to shrink.
export function FieldRow({ className, children }: FieldRowProps): React.JSX.Element {
  return <div className={cn("flex min-w-0 flex-wrap gap-2.5", className)}>{children}</div>;
}

// The micro-label column a bare `<label>` needs around its ask: caption over control.
const CAPTIONED = "flex flex-col gap-1.5";

// The ask on its own, for a field that already lays itself out — a `FieldLabel`, a `FieldGroup`,
// or a nested
// `FieldRow`. 5rem is the narrowest a pulse control stays readable at (an `Input` spends 2rem of
// it on its own padding, a `Select` 3.5rem), and it is this ask that makes a three-field row
// stack rather than squeeze each field to the 56px a 320px phone gave it before.
export const FIELD_WIDTH = "min-w-0 grow basis-20";

// The same ask, captioned, for a bare `<label>`.
export const FIELD_CELL = `${FIELD_WIDTH} ${CAPTIONED}`;

// A field whose caption or options are words rather than numbers — the Load-kind picker, whose
// longest option is "Percent of 1RM". It asks for 7rem, the width its old track had; in a row of
// such fields the ask is also what keeps two of them on a line rather than three.
export const WIDE_FIELD_WIDTH = "min-w-0 grow basis-28";

// The wide ask, captioned.
export const WIDE_FIELD_CELL = `${WIDE_FIELD_WIDTH} ${CAPTIONED}`;

// A field that takes a line of its own: it asks for the whole row.
export const FULL_FIELD_CELL = `min-w-0 basis-full ${CAPTIONED}`;
