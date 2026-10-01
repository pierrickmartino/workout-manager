import { ArrowDown, ArrowUp, Link2, Trash2, Unlink } from "@/components/pulse/icons";

import type { DraftPrescription, SupersetSlot } from "@/lib/protocol-builder";
import { Button } from "@/components/ui/button";

// The presentational parts of a Prescription row: the Superset member badge, the frozen
// read-only row, and the reorder/group/remove button floor. None of them reads the draft — they
// are driven entirely by what they are handed, which is why they live apart from the rows that
// read `PrescriptionDraftContext` (ADR-0105) and can be rendered from any surface.

// The A/B/C member badge for a Prescription inside a Superset (ADR-0023) — a compact, mono chip
// that communicates round-major membership without restructuring the row.
export function SupersetBadge({ label }: { label: string }) {
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-cyan-dim font-mono text-[10px] font-bold text-cyan"
      aria-label={`Superset member ${label}`}
    >
      {label}
    </span>
  );
}

// One read-only Prescription row for a performed (frozen) Session (ADR-0020).
export function PrescriptionReadOnly({
  prescription,
  slot,
}: {
  prescription: DraftPrescription;
  slot: SupersetSlot;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 truncate">
        {slot.memberLabel ? <SupersetBadge label={slot.memberLabel} /> : null}
        <span className="truncate font-sans text-[13px] text-text-secondary">
          {prescription.exerciseName}
        </span>
      </span>
      <span className="shrink-0 font-mono text-[12px] text-text-muted">
        {prescription.sets} × {prescription.reps}
      </span>
    </div>
  );
}

interface PrescriptionControlsProps {
  name: string;
  slot: SupersetSlot;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onGroupWithNext: () => void;
  onUngroup: () => void;
  onRemove: () => void;
}

// Reorder (up/down), Superset group/ungroup, and remove controls for one Prescription in an
// un-performed Session. These `aria`-labelled buttons are the accessibility floor (#153): the
// keyboard/click path for reordering and grouping, unchanged by the drag enhancement layered on
// in Slice 5 (ADR-0023).
//
// Its handlers stay props rather than context reads: each is one row's `dispatch` closed over
// one position, and a button that names its own effect at the call site is what keeps this the
// legible floor it is meant to be.
export function PrescriptionControls({
  name,
  slot,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onGroupWithNext,
  onUngroup,
  onRemove,
}: PrescriptionControlsProps) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      {slot.canGroupWithNext ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 text-cyan"
          aria-label={`Group ${name} with next into a superset`}
          onClick={onGroupWithNext}
        >
          <Link2 className="h-4 w-4" aria-hidden />
        </Button>
      ) : null}
      {slot.group !== null ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 text-cyan"
          aria-label={`Ungroup ${name} from its superset`}
          onClick={onUngroup}
        >
          <Unlink className="h-4 w-4" aria-hidden />
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-11 w-11"
        disabled={!canMoveUp}
        aria-label={`Move ${name} up`}
        onClick={onMoveUp}
      >
        <ArrowUp className="h-4 w-4" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-11 w-11"
        disabled={!canMoveDown}
        aria-label={`Move ${name} down`}
        onClick={onMoveDown}
      >
        <ArrowDown className="h-4 w-4" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-11 w-11 text-magenta"
        aria-label={`Remove ${name}`}
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}
