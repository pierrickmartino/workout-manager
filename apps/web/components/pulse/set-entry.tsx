"use client";

import { createContext, use, type ChangeEventHandler, type ReactNode } from "react";

import {
  DURATION_PLACEHOLDER,
  SET_ENTRY_KIND_OPTIONS,
  SET_ENTRY_LABELS,
  SET_ENTRY_EFFORT_VALUES,
  setEntryLabel,
  setEntryName,
  setEntryValueBinding,
  type SetEntryField,
  type SetEntryMode,
  type SetEntrySubject,
  type SetEntryValues,
} from "@/lib/set-entry";
import { loadKindOptions, loadValueInputMode } from "@/lib/load";
import { DISTANCE_UNIT_OPTIONS } from "@/lib/quantity";
import type { QuantityKind } from "@/lib/quantity";
import type { WeightUnit } from "@/lib/weight-unit";
import { FieldRow, FIELD_CELL, WIDE_FIELD_CELL } from "@/components/pulse/field-row";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

// The one contract a Logged Set's entry fields are rendered through (ADR-0106). Shaped as
// `state` / `actions` / `meta` like `PrescriptionDraftContext` (ADR-0105), so it is a contract
// two providers implement rather than a private channel: the fields render against the
// interface, and *how* a row's values are held — client state, or the DOM under a server
// action — is the provider's business.
//
// That split is the whole point. The same amount/load UI was written four times across
// `AdhocLogForm`, `CorrectLogForm` (twice), `LogSessionForm` and `live-session-sets`, and the
// only real difference between the copies was `value`/`onChange` against `defaultValue`. The
// copies had already drifted in ways no type could catch — see `lib/set-entry.ts`.

// What the fields render: the row's values, whether it takes entry at all, and the unit its
// Load is authored in.
export interface SetEntryState {
  values: SetEntryValues;
  // A skipped log row must not reach the record (Model B), and a completed Live Session set is
  // read-only until reopened (ADR-0089). Both are the same "this row takes no entry".
  disabled: boolean;
  // The reader's Weight Unit (#417), which the Load picker names and the value is entered in.
  unit: WeightUnit;
}

// The fields' one outward verb. Every field raises the same shape — a patch naming its own
// vocabulary word — so a new field reaches its holder without a new callback prop.
export interface SetEntryActions {
  edit: (patch: Partial<SetEntryValues>) => void;
}

// How the row is addressed: which form it posts into, and what it is called. Not state (it
// never changes while the row is mounted) and not an action, but every field needs it.
export interface SetEntryMeta {
  mode: SetEntryMode;
  // The `set-<i>` prefix the row's fields submit under, or null for a row in no form.
  prefix: string | null;
  subject: SetEntrySubject;
}

export interface SetEntryContextValue {
  state: SetEntryState;
  actions: SetEntryActions;
  meta: SetEntryMeta;
}

// Private: a field reaches the row through `useSetEntry`, and a provider supplies it, so the
// context object itself is nobody else's handle.
const SetEntryContext = createContext<SetEntryContextValue | null>(null);

// Read the row. Throws outside a provider rather than defaulting: a field with no row behind it
// would render blank and silently discard every edit, which is worse than a crash at the one
// moment a developer can fix it.
export function useSetEntry(): SetEntryContextValue {
  const row = use(SetEntryContext);
  if (row === null) {
    throw new Error(
      "A set-entry field must render inside a SetEntryProvider or a SetEntryFormProvider.",
    );
  }
  return row;
}

interface ProviderProps {
  values: SetEntryValues;
  unit: WeightUnit;
  prefix: string | null;
  subject: SetEntrySubject;
  disabled?: boolean;
  children: ReactNode;
}

// A row whose fields are driven by their holder: it supplies the values and takes every edit.
// This is the shape the two client-state forms want — the ad-hoc log, whose rows live in a
// draft, and the plan-backed log, whose rows derive a Completion Outcome live from what is
// entered.
export function SetEntryProvider({
  values,
  unit,
  prefix,
  subject,
  disabled = false,
  onEdit,
  children,
}: ProviderProps & { onEdit: SetEntryActions["edit"] }) {
  return (
    <SetEntryContext
      value={{
        state: { values, disabled, unit },
        actions: { edit: onEdit },
        meta: { mode: "controlled", prefix, subject },
      }}
    >
      {children}
    </SetEntryContext>
  );
}

// A row seeded once and then owned by the DOM, for a form that reads its values back out of
// the FormData on submit. This is the shape Log Correction wants: every field is pre-filled
// from the record, and the form full-replaces its sets on save.
//
// Such a row can honour exactly **one** edit, which is why this provider takes that one by name
// rather than a general `edit`: the Quantity kind decides which fields exist, so its picker has
// to be driven even here, while every other field is seeded and then left to the DOM. Anything
// else raising an edit is a mistake, and raises rather than being dropped in silence — a
// discarded edit on a form the user is filling in is the failure this whole family exists to
// prevent, and it would look exactly like the field working.
export function SetEntryFormProvider({
  values,
  unit,
  prefix,
  subject,
  disabled = false,
  onKindChange,
  children,
}: ProviderProps & { onKindChange?: (kind: QuantityKind) => void }) {
  return (
    <SetEntryContext
      value={{
        state: { values, disabled, unit },
        actions: { edit: seededEdit(onKindChange) },
        meta: { mode: "uncontrolled", prefix, subject },
      }}
    >
      {children}
    </SetEntryContext>
  );
}

// The one edit a seeded row can honour, and a loud failure for anything else. The cast is the
// picker's own vocabulary: it renders its options from `SET_ENTRY_KIND_OPTIONS`, whose values are
// `QuantityKind`, so a value outside that set has no way to be chosen.
function seededEdit(
  onKindChange: ((kind: QuantityKind) => void) | undefined,
): SetEntryActions["edit"] {
  return (patch) => {
    const fields = Object.keys(patch);
    if (patch.kind === undefined || fields.length !== 1) {
      throw new Error(
        `A seeded set-entry row owns only its Quantity kind, so it cannot take an edit to ${fields.join(", ")}.`,
      );
    }
    if (onKindChange === undefined) {
      throw new Error(
        "This seeded set-entry row renders a Quantity kind picker but was given no onKindChange, so the pick has nowhere to go.",
      );
    }
    onKindChange(patch.kind as QuantityKind);
  };
}

// The props one field takes, resolved from the row. `E` is the element so a handler stays
// assignable to the primitive it is handed to, with no cast at the call site.
interface SetEntryControlProps<E extends HTMLInputElement | HTMLSelectElement> {
  readonly name: string | undefined;
  readonly "aria-label": string;
  readonly disabled: boolean;
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onChange?: ChangeEventHandler<E>;
}

interface CaptionOverrides {
  // The visible micro-label, where it differs from the vocabulary's own caption.
  readonly caption?: string;
  // The noun the accessible name is built from, where it differs from the caption. The two
  // genuinely diverge: a duration entered *as* the amount is captioned "Time" and announced
  // "Duration", because a lone "Time" would not say which of a set's two times it is.
  readonly noun?: string;
}

// Resolve one field: what it is called, what it submits as, and which of React's two value
// props it takes. Every branch on the row's mode lives here, which is what lets each field
// component below stay blind to which kind of form it is inside.
function useSetEntryField<E extends HTMLInputElement | HTMLSelectElement>(
  field: SetEntryField,
  overrides: CaptionOverrides = {},
): { readonly caption: string; readonly control: SetEntryControlProps<E> } {
  const { state, actions, meta } = useSetEntry();
  const caption = overrides.caption ?? SET_ENTRY_LABELS[field];
  const controlled = meta.mode === "controlled";
  return {
    caption,
    control: {
      name: setEntryName(meta.prefix, field),
      "aria-label": setEntryLabel(meta.subject, overrides.noun ?? caption),
      disabled: state.disabled,
      ...setEntryValueBinding(meta.mode, state.values[field]),
      onChange: controlled
        ? (event) => actions.edit({ [field]: event.target.value })
        : undefined,
    },
  };
}

// The caption over a field. A `<span>` inside the field's own `<label>`, so the control's
// accessible name comes from the explicit `aria-label` and the caption reads as its own line.
function Caption({ children }: { children: ReactNode }) {
  return <span className="label-mono text-[9px] text-text-muted">{children}</span>;
}

// The width a field asks for (ADR-0087). A row keeps its fields side by side while the asks fit
// and stacks them when they do not, so this is a width *ask*, never a track. Only the two parts a
// call site actually varies take one — `Distance`, whose nested row asks for the whole line, and
// `Duration`, which one form gives a line of its own. The rest carry their ordinary ask and no
// knob, because a prop no caller passes is a guess about the next caller.
interface CellProps {
  className?: string;
}

// The authored movement name, for a row that names its own exercise rather than carrying a
// prescribed one. Resolved to an Exercise server-side from the typed name (ADR-0033).
export function SetEntryMovement({
  placeholder,
  required = false,
}: { placeholder: string; required?: boolean }) {
  const { caption, control } = useSetEntryField<HTMLInputElement>("movement", {
    noun: "Movement name",
  });
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
      <Caption>{caption}</Caption>
      {/* An authored name is not prose, and a red underline under half of one typed so far is
          noise on every row in the form (ADR-0103). */}
      <Input spellCheck={false} placeholder={placeholder} required={required} {...control} />
    </label>
  );
}

// The Quantity kind (ADR-0032) — a rep count, a distance, or a duration. Always driven by its
// holder, in both kinds of form: the pick decides which Quantity fields exist below it.
export function SetEntryKind() {
  const { state, actions, meta } = useSetEntry();
  const caption = SET_ENTRY_LABELS.kind;
  return (
    <label className="flex flex-col gap-1.5">
      <Caption>{caption}</Caption>
      <Select
        name={setEntryName(meta.prefix, "kind")}
        aria-label={setEntryLabel(meta.subject, "Quantity kind")}
        disabled={state.disabled}
        value={state.values.kind}
        onChange={(event) => actions.edit({ kind: event.target.value })}
      >
        {SET_ENTRY_KIND_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

// A rep count. `placeholder` is the prescribed hint where the row has one, so a reused plan
// shows what it asked for without pre-filling an answer the user did not give.
export function SetEntryReps({ placeholder }: { placeholder?: string }) {
  const { caption, control } = useSetEntryField<HTMLInputElement>("reps");
  return (
    <label className={FIELD_CELL}>
      <Caption>{caption}</Caption>
      <Input type="number" min={0} placeholder={placeholder} {...control} />
    </label>
  );
}

// A distance, its unit, and the optional companion time (ADR-0032) — given, pace becomes a
// derivable read. Three cells, so this part owns the row they sit in: `className` is the ask
// that row makes, which is `basis-full` wherever it is nested inside another row beside the
// effort picker.
export function SetEntryDistance({ className }: CellProps) {
  const distance = useSetEntryField<HTMLInputElement>("distance");
  const unit = useSetEntryField<HTMLSelectElement>("unit", { noun: "Distance unit" });
  const time = useSetEntryField<HTMLInputElement>("duration", { noun: "Time" });
  return (
    <FieldRow className={className}>
      <label className={FIELD_CELL}>
        <Caption>{distance.caption}</Caption>
        {/* `step="any"` is what makes the keypad decimal rather than integer (ADR-0093) —
            3.1 miles has to be typable. */}
        <Input type="number" min={0} step="any" placeholder="5" {...distance.control} />
      </label>
      <label className={FIELD_CELL}>
        <Caption>{unit.caption}</Caption>
        <Select {...unit.control}>
          {DISTANCE_UNIT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </label>
      <label className={FIELD_CELL}>
        <Caption>{time.caption}</Caption>
        <Input spellCheck={false} placeholder={DURATION_PLACEHOLDER} {...time.control} />
      </label>
    </FieldRow>
  );
}

// A duration as the amount itself: timed, non-locomotion work — a hold, or a distance-unknown
// timed effort — entered as `mm:ss` or bare seconds (ADR-0032).
export function SetEntryDuration({ className = FIELD_CELL }: CellProps) {
  const { caption, control } = useSetEntryField<HTMLInputElement>("duration", {
    caption: "Time",
    noun: "Duration",
  });
  return (
    <label className={className}>
      <Caption>{caption}</Caption>
      <Input spellCheck={false} placeholder={DURATION_PLACEHOLDER} {...control} />
    </label>
  );
}

// A caller states the width ask it wants *per shape* rather than branching on the kind itself —
// the branch is this part's whole job, and a call site that repeated it would be back to four
// copies of the thing being consolidated. Only the two asks a call site actually makes exist: a
// lone duration taking the whole line, and the distance block's nested row. Everything else
// renders the ordinary one-field ask.
interface QuantityProps {
  // The ask a lone duration makes. One form gives a hold time the whole line.
  durationClassName?: string;
  // The ask the three-cell distance block makes, which differs because it is a nested row.
  rowClassName?: string;
  // The prescribed hint, where the row has one.
  repsPlaceholder?: string;
}

// The field(s) for the row's Quantity kind. One branch, in one place: adding a kind (ADR-0032)
// now means adding an option in `lib/set-entry.ts` and a case here, rather than editing four
// forms and degrading the amount in whichever one was missed.
export function SetEntryQuantity({
  durationClassName,
  rowClassName,
  repsPlaceholder,
}: QuantityProps) {
  const { state } = useSetEntry();
  if (state.values.kind === "distance") return <SetEntryDistance className={rowClassName} />;
  if (state.values.kind === "duration") return <SetEntryDuration className={durationClassName} />;
  return <SetEntryReps placeholder={repsPlaceholder} />;
}

// The typed Load (ADR-0010): pick the kind, then give the value that kind carries. **The** one
// place a Load kind is added — the duplication this family exists to end, because a kind
// missing from one of five copies degrades a typed Load silently in exactly one form.
//
// Two cells, returned bare so the caller's own row holds them: one form puts the effort picker
// on the same line, and a wrapper here would make that impossible.
export function SetEntryLoad({ placeholder = "70" }: { placeholder?: string }) {
  const kind = useSetEntryField<HTMLSelectElement>("load_kind");
  const value = useSetEntryField<HTMLInputElement>("load_value");
  const { state } = useSetEntry();
  return (
    <>
      <label className={WIDE_FIELD_CELL}>
        <Caption>{kind.caption}</Caption>
        <Select {...kind.control}>
          {loadKindOptions(state.unit).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </label>
      <label className={FIELD_CELL}>
        <Caption>{value.caption}</Caption>
        {/* The keypad follows the picked kind (ADR-0093): a number for the weight-bearing
            kinds, the full keyboard for a `low-high` range or a descriptive Load, which a
            numeric pad offers no way to type. */}
        <Input
          spellCheck={false}
          placeholder={placeholder}
          inputMode={loadValueInputMode(state.values.load_kind)}
          {...value.control}
        />
      </label>
    </>
  );
}

// Perceived difficulty, 1-10. Optional, so the blank is a real choice rather than a missing one.
export function SetEntryEffort() {
  const { caption, control } = useSetEntryField<HTMLSelectElement>("rpe");
  return (
    <label className={FIELD_CELL}>
      <Caption>{caption}</Caption>
      <Select {...control}>
        <option value="">—</option>
        {SET_ENTRY_EFFORT_VALUES.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </Select>
    </label>
  );
}

// A per-set remark (ADR-0065). Rides as raw text; the backend length-caps and HTML-escapes it
// at the write boundary.
export function SetEntryNote({ placeholder }: { placeholder: string }) {
  const { caption, control } = useSetEntryField<HTMLInputElement>("note");
  return (
    <label className="flex flex-col gap-1.5">
      <Caption>{caption}</Caption>
      {/* A note is prose, unlike every other field here, so it keeps the browser's spelling
          checker — stated rather than left to the default (ADR-0103). */}
      <Input spellCheck placeholder={placeholder} {...control} />
    </label>
  );
}

// The family, named so a call site reads as the row it is composing.
export const SetEntry = {
  Movement: SetEntryMovement,
  Kind: SetEntryKind,
  Quantity: SetEntryQuantity,
  Reps: SetEntryReps,
  Distance: SetEntryDistance,
  Duration: SetEntryDuration,
  Load: SetEntryLoad,
  Effort: SetEntryEffort,
  Note: SetEntryNote,
};
