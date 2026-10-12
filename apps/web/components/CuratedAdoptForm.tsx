"use client";

import { useActionState } from "react";

import {
  adoptCuratedProtocolAction,
  type AdoptCuratedProtocolState,
} from "@/app/protocols/actions";
import type { AdoptFormDefaults } from "@/lib/curated-protocol-view";
import { Field } from "@/components/pulse/field";
import { Alert } from "@/components/pulse/alert";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface CuratedAdoptFormProps {
  identifier: string;
  defaults: AdoptFormDefaults;
}

// The adopt form for one Curated Protocol (issue #684): a length within the program's range
// and a starting weight per main lift, prefilled with conservative defaults. The server action
// checks the form against the program and the API recomputes the whole plan; a refusal shows
// inline and nothing is saved.
export function CuratedAdoptForm({
  identifier,
  defaults,
}: CuratedAdoptFormProps): React.JSX.Element {
  const [state, action, pending] = useActionState<AdoptCuratedProtocolState, FormData>(
    adoptCuratedProtocolAction,
    { error: null },
  );

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.error ? <Alert announce tone="error">{state.error}</Alert> : null}
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

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Adopting…" : "Adopt this protocol"}
      </Button>
    </form>
  );
}
