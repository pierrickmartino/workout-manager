"use client";

import { startTransition, useActionState, useState } from "react";

import {
  adoptCuratedProtocolAction,
  previewCuratedProtocolAction,
  type AdoptCuratedProtocolState,
  type PreviewCuratedProtocolState,
} from "@/app/protocols/actions";
import type { AdoptFormDefaults } from "@/lib/curated-protocol-view";
import {
  adoptFormSnapshot,
  defaultFormSnapshot,
  previewControls,
  type CuratedPreview,
} from "@/lib/curated-plan-preview";
import { CuratedPlanPreview } from "@/components/CuratedPlanPreview";
import { Field } from "@/components/pulse/field";
import { Alert } from "@/components/pulse/alert";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface CuratedAdoptFormProps {
  identifier: string;
  defaults: AdoptFormDefaults;
  // The plan for the untouched defaults, previewed by the page; null when that read failed.
  initialPreview: CuratedPreview | null;
}

const ADOPT_NOTICE_ID = "curated-adopt-notice";

// The adopt form for one Curated Protocol (issues #684, #685): a length within the Curated
// Protocol's range and a starting weight per main lift, prefilled with conservative defaults,
// and the fully enumerated plan those inputs would write. Editing an input makes the shown
// plan stale and holds Adopt back until the user previews again, so what is adopted is what
// was seen. The API recomputes the plan on adopt; a refusal shows inline and nothing is saved.
//
// Both actions are dispatched by hand rather than as the form's `action`: React resets a form
// once its action completes, which would wipe the inputs the user just previewed.
export function CuratedAdoptForm({
  identifier,
  defaults,
  initialPreview,
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
          <Field key={lift.key} label={lift.label} hint="Starting weight in kg">
            <Input
              name={lift.name}
              type="number"
              step="any"
              min={0}
              required
              spellCheck={false}
              defaultValue={lift.defaultKg}
            />
          </Field>
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
