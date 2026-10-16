"use client";

import Link from "next/link";

import { Field } from "@/components/pulse/field";
import { FieldRow, WIDE_FIELD_WIDTH } from "@/components/pulse/field-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  GENERATOR_KIND_OPTIONS,
  OUTCOME_OPTIONS,
  type AuditLogFilters,
  type FilterOption,
} from "@/lib/admin-generation-calls-query";

interface GenerationCallFiltersProps {
  filters: AuditLogFilters;
  // Whether any filter is set, so "Clear" shows only when there is something to clear.
  isFiltered: boolean;
}

// The admin AI audit log's filter controls (issue #732). A GET form onto the page's own URL
// (`?kind=&outcome=&user=`), so a filtered view survives a refresh and can be shared, and
// applying a filter starts again at page 1. A plain form rather than `next/form`: it needs no
// router, and an admin filter is not worth a soft navigation. The server parses the URL; this
// only renders it. `"use client"` only because the form primitives claim their `Field` ids
// through a client hook; the page keys it on the filters, so the fields reseed on navigation.
export function GenerationCallFilters({
  filters,
  isFiltered,
}: GenerationCallFiltersProps): React.JSX.Element {
  return (
    <form action="/admin/ai-audit-log" method="get" className="flex flex-col gap-3">
      <FieldRow>
        <Field label="Kind" className={WIDE_FIELD_WIDTH}>
          <Select name="kind" defaultValue={filters.generatorKind ?? ""}>
            <FilterOptions options={GENERATOR_KIND_OPTIONS} />
          </Select>
        </Field>
        <Field label="Outcome" className={WIDE_FIELD_WIDTH}>
          <Select name="outcome" defaultValue={filters.outcome ?? ""}>
            <FilterOptions options={OUTCOME_OPTIONS} />
          </Select>
        </Field>
        <Field label="User id" className="min-w-0 grow basis-48">
          <Input
            name="user"
            type="text"
            defaultValue={filters.userId ?? ""}
            placeholder="user_…"
            spellCheck={false}
            autoCapitalize="off"
          />
        </Field>
      </FieldRow>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="secondary" size="sm">
          Apply filters
        </Button>
        {isFiltered ? (
          <Link
            href="/admin/ai-audit-log"
            className="label-mono text-[11px] text-cyan hover:underline"
          >
            Clear filters
          </Link>
        ) : null}
      </div>
    </form>
  );
}

// "Any" (an open axis, sent blank and read as no filter) and then the known values.
function FilterOptions({
  options,
}: {
  options: readonly FilterOption[];
}): React.JSX.Element {
  return (
    <>
      <option value="">Any</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </>
  );
}
