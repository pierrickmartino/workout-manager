"use client";

import { startTransition, useActionState, useState } from "react";

import {
  adoptCuratedProtocolAction,
  previewCuratedProtocolAction,
  type AdoptCuratedProtocolState,
  type PreviewCuratedProtocolState,
} from "@/app/protocols/actions";
import {
  MAX_WORKING_SET_REPS,
  MIN_WORKING_SET_REPS,
  type AdoptFormDefaults,
  type AdoptLiftField,
  type CuratedCaveat,
} from "@/lib/curated-protocol-view";
import {
  adoptFormSnapshot,
  defaultFormSnapshot,
  previewControls,
  type CuratedPreview,
} from "@/lib/curated-plan-preview";
import { CuratedPlanPreview } from "@/components/CuratedPlanPreview";
import { Field, FieldGroup } from "@/components/pulse/field";
import { FIELD_WIDTH, FieldRow } from "@/components/pulse/field-row";
import { Alert } from "@/components/pulse/alert";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface CuratedAdoptFormProps {
  identifier: string;
  defaults: AdoptFormDefaults;
  // The plan for the untouched defaults, previewed by the page; null when that read failed.
  initialPreview: CuratedPreview | null;
  // The Sensitive Constraint caveat (issue #687), shown before anything can be adopted; null
  // when it doesn't apply to this user.
  caveat: CuratedCaveat | null;
}

const ADOPT_NOTICE_ID = "curated-adopt-notice";

// The adopt form for one Curated Protocol (issues #684, #685): a length within the Curated
// Protocol's range and a starting weight per main lift (a recent working set, weight and reps,
// for a wave Curated Protocol, issue #693), prefilled from the user's Estimated 1RM
// where they have one and with conservative defaults otherwise (issue #686), and the fully
// enumerated plan those inputs would write. Editing an input makes the shown plan stale and
// holds Adopt back until the user previews again, so what is adopted is what was seen. The API
// recomputes the plan on adopt; a refusal shows inline and nothing is saved.
//
// Both actions are dispatched by hand rather than as the form's `action`: React resets a form
// once its action completes, which would wipe the inputs the user just previewed.
export function CuratedAdoptForm({
  identifier,
  defaults,
  initialPreview,
  caveat,
}: CuratedAdoptFormProps): React.JSX.Element {
  const [previewState, preview, previewing] = useActionState<
    PreviewCuratedProtocolState,
    FormData
  >(previewCuratedProtocolAction, { preview: initialPreview, error: null });
  const [adoptState, adopt, adopting] = useActionState<AdoptCuratedProtocolState, FormData>(
    adoptCuratedProtocolAction,
    { error: null },
  );
  // Seeded once from `defaults`, which the page never changes; every edit updates it.
  const [inputs, setInputs] = useState(() => defaultFormSnapshot(defaults));
  const controls = previewControls(previewState.preview, inputs);

  function onChange(event: React.FormEvent<HTMLFormElement>): void {
    setInputs(adoptFormSnapshot(defaults, new FormData(event.currentTarget)));
  }

  // Submitting the form (the Preview button, or Enter in a field) previews.
  function onPreview(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => preview(form));
  }

  function onAdopt(event: React.MouseEvent<HTMLButtonElement>): void {
    const owner = event.currentTarget.form;
    if (!owner) return;
    const form = new FormData(owner);
    startTransition(() => adopt(form));
  }

  return (
    <div className="flex flex-col gap-8">
      {caveat ? (
        <Alert tone="info">
          <span className="flex flex-col gap-1">
            <strong className="font-semibold text-text-primary">{caveat.title}</strong>
            <span>{caveat.body}</span>
          </span>
        </Alert>
      ) : null}
      <form onSubmit={onPreview} onChange={onChange} className="flex flex-col gap-5">
        {previewState.error ? (
          <Alert announce tone="error">{previewState.error}</Alert>
        ) : null}
        {adoptState.error ? <Alert announce tone="error">{adoptState.error}</Alert> : null}
        <input type="hidden" name="identifier" value={identifier} />

        <Field label="Length">
          <Select name="weeks" defaultValue={String(defaults.weeks)}>
            {defaults.weekOptions.map((weeks) => (
              <option key={weeks} value={weeks}>
                {weeks} weeks
              </option>
            ))}
          </Select>
        </Field>

        {defaults.lifts.map((lift) => (
          <LiftInput key={lift.key} lift={lift} />
        ))}

        <div className="flex flex-col gap-3">
          <Button type="submit" variant="secondary" disabled={previewing} className="w-full">
            {previewing ? "Previewing…" : controls.previewLabel}
          </Button>
          {/* Always mounted, so the live region exists before its text changes. */}
          <p
            id={ADOPT_NOTICE_ID}
            role="status"
            className={controls.notice ? "font-mono text-[12px] text-text-secondary" : "sr-only"}
          >
            {controls.notice}
          </p>
          <Button
            type="button"
            onClick={onAdopt}
            disabled={!controls.canAdopt || previewing || adopting}
            aria-describedby={controls.notice ? ADOPT_NOTICE_ID : undefined}
            className="w-full"
          >
            {adopting ? "Adopting…" : "Adopt this protocol"}
          </Button>
        </div>
      </form>

      {previewState.preview ? <CuratedPlanPreview plan={previewState.preview.plan} /> : null}
    </div>
  );
}

// One main lift's input: a starting weight, or a working set's weight and reps grouped under
// the lift's name, so each control's own label stays short and the group names the lift.
function LiftInput({ lift }: { lift: AdoptLiftField }): React.JSX.Element {
  const weight = { name: lift.name, defaultValue: lift.initialKg };
  if (lift.reps === null) {
    return (
      <Field label={lift.label} hint={lift.hint}>
        <Input {...weight} type="number" step="any" min={0} required spellCheck={false} />
      </Field>
    );
  }
  return (
    <FieldGroup label={lift.label}>
      <FieldRow>
        <Field label="Weight" hint={lift.hint} className={FIELD_WIDTH}>
          <Input {...weight} type="number" step="any" min={0} required spellCheck={false} />
        </Field>
        <Field label={lift.reps.label} hint={lift.reps.hint} className={FIELD_WIDTH}>
          <Input
            name={lift.reps.name}
            defaultValue={lift.reps.initial}
            type="number"
            step={1}
            min={MIN_WORKING_SET_REPS}
            max={MAX_WORKING_SET_REPS}
            required
            spellCheck={false}
          />
        </Field>
      </FieldRow>
    </FieldGroup>
  );
}
