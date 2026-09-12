"use client";

// PROTOTYPE — throwaway. The editable prescription panel the composition strip
// focuses when a tile is selected. Shared across all three variants (each places it
// where its layout wants it), so the "select a tile → edit its prescription" loop is
// consistent while the surrounding composition layout is what we're actually judging.
// Fields hold ephemeral local state only — no reducer, no persistence.

import { ROLE_META, type PrototypePrescription } from "./composition-data";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PrescriptionEditorCardProps {
  prescription: PrototypePrescription | null;
  onEditField: (
    id: number,
    field: "sets" | "target" | "load" | "restSeconds" | "note",
    value: string,
  ) => void;
  // Whether to draw the accent focus ring — the "focus moved here" cue after a tile
  // is picked. Variants that already sit the editor beside the strip can turn it off.
  highlight?: boolean;
}

export function PrescriptionEditorCard({
  prescription,
  onEditField,
  highlight = true,
}: PrescriptionEditorCardProps) {
  if (!prescription) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed border-border p-6 text-center">
        <p className="font-mono text-[13px] text-text-muted">
          Select an exercise in the composition above to edit its prescription.
        </p>
      </div>
    );
  }

  const role = ROLE_META[prescription.role];
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-md border bg-surface p-4 transition-shadow",
        highlight ? cn(role.border, "ring-2", role.ring) : "border-border",
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("h-2.5 w-2.5 rounded-full", role.dot)} aria-hidden />
        <span className="font-display text-[16px] font-semibold text-text-primary">
          {prescription.name}
        </span>
        <Badge variant="outline" className="ml-auto">
          {role.label}
        </Badge>
        {prescription.supersetGroup ? (
          <Badge variant="cyan">SUPERSET</Badge>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field
          label="Sets"
          value={String(prescription.sets)}
          onChange={(v) => onEditField(prescription.id, "sets", v)}
        />
        <Field
          label="Target"
          value={prescription.target}
          onChange={(v) => onEditField(prescription.id, "target", v)}
        />
        <Field
          label="Load"
          value={prescription.load}
          onChange={(v) => onEditField(prescription.id, "load", v)}
        />
        <Field
          label="Rest (sec)"
          value={prescription.restSeconds === null ? "" : String(prescription.restSeconds)}
          onChange={(v) => onEditField(prescription.id, "restSeconds", v)}
        />
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="label-mono text-[9px] text-text-muted">Coaching note</span>
        <Input
          value={prescription.note ?? ""}
          placeholder="Add a cue…"
          aria-label={`Note for ${prescription.name}`}
          onChange={(e) => onEditField(prescription.id, "note", e.target.value)}
        />
      </label>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label-mono text-[9px] text-text-muted">{label}</span>
      <Input
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
