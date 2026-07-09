"use client";

import { useReducer, useState, useTransition } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";

import { submitDeploy } from "@/app/protocols/[id]/edit/actions";
import {
  builderReducer,
  initBuilderDraft,
  toDeployPayload,
  type BuilderDraft,
  type DraftPrescription,
  type DraftSession,
} from "@/lib/protocol-builder";
import { LOAD_KIND_OPTIONS, type LoadKind } from "@/lib/load";
import type { ProtocolProgress } from "@/lib/protocols-types";
import { PageHeader } from "@/components/pulse/page-header";
import { SectionHeader } from "@/components/pulse/section-header";
import { Alert } from "@/components/pulse/alert";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface ProtocolBuilderProps {
  protocol: ProtocolProgress;
}

// The Protocol Builder screen (Module I, ADR-0020). Edits stage in a client-side
// draft via the pure reducer and change nothing live until DEPLOY PROTOCOL sends the
// desired un-performed tail. Performed Sessions render read-only (the frozen prefix,
// enforced again server-side). Leaving the page discards the draft with no effect.
export function ProtocolBuilder({ protocol }: ProtocolBuilderProps) {
  const [draft, dispatch] = useReducer(
    builderReducer,
    protocol,
    initBuilderDraft,
  );
  const [error, setError] = useState<string | null>(null);
  const [deployed, setDeployed] = useState(false);
  const [pending, startTransition] = useTransition();

  function onDeploy() {
    setError(null);
    setDeployed(false);
    startTransition(async () => {
      const result = await submitDeploy(draft.protocolId, toDeployPayload(draft));
      if (result.error || !result.protocol) {
        setError(result.error ?? "Could not deploy the protocol.");
        return;
      }
      setDeployed(true);
    });
  }

  return (
    <section className="flex flex-col gap-7">
      <PageHeader
        overline="PULSE // BUILDER"
        title={<span className="capitalize">{protocol.training_type}</span>}
        action={<Badge variant="cyan">{draft.weeks}W</Badge>}
      />

      <div className="flex items-center justify-between">
        <span className="label-mono text-[11px] capitalize text-cyan">
          {protocol.objective}
        </span>
        <span className="label-mono text-[10px] text-text-muted">
          {draft.sessionsPerWeek}×/WEEK · {draft.weeks} WEEKS
        </span>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {deployed ? (
        <Alert tone="success">Protocol deployed — your changes are live.</Alert>
      ) : null}

      <div className="flex flex-col gap-4">
        <SectionHeader meta={`${draft.sessions.length} SESSIONS`}>
          SESSIONS
        </SectionHeader>
        <ol className="flex list-none flex-col gap-3 p-0">
          {draft.sessions.map((session, sessionIndex) => (
            <li key={session.sessionId}>
              <SessionEditor
                session={session}
                onEditField={(position, field, value) =>
                  dispatch({
                    type: "EDIT_PRESCRIPTION",
                    sessionId: session.sessionId,
                    position,
                    field,
                    value,
                  })
                }
                onEditLoad={(position, loadKind, loadValue) =>
                  dispatch({
                    type: "EDIT_LOAD",
                    sessionId: session.sessionId,
                    position,
                    loadKind,
                    loadValue,
                  })
                }
                index={sessionIndex + 1}
              />
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-col gap-3">
        <Button onClick={onDeploy} disabled={pending} className="w-full">
          {pending ? "Deploying…" : "DEPLOY PROTOCOL"}
        </Button>
        <Link
          href={`/protocols/${protocol.id}`}
          className="text-center label-mono text-[10px] text-text-muted transition-colors hover:text-cyan"
        >
          CANCEL — DISCARD CHANGES
        </Link>
      </div>
    </section>
  );
}

interface SessionEditorProps {
  session: DraftSession;
  index: number;
  onEditField: (
    position: number,
    field: "sets" | "reps" | "restSeconds" | "tempo",
    value: string | number | null,
  ) => void;
  onEditLoad: (position: number, loadKind: LoadKind, loadValue: string) => void;
}

function SessionEditor({
  session,
  index,
  onEditField,
  onEditLoad,
}: SessionEditorProps) {
  const locked = session.performed;
  return (
    <Card
      className={`flex flex-col gap-3 p-4 ${locked ? "opacity-70" : ""}`}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-base font-mono text-[13px] font-bold text-cyan">
          {String(index).padStart(2, "0")}
        </span>
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="font-display text-[15px] font-semibold text-text-primary">
            Week {session.week}, Day {session.day}
          </span>
          <span className="label-mono text-[9px] text-text-muted">
            {session.prescriptions.length} EXERCISES
          </span>
        </div>
        {locked ? (
          <Badge variant="muted">
            <Lock className="mr-1 inline h-3 w-3" aria-hidden />
            PERFORMED
          </Badge>
        ) : null}
      </div>

      <ul className="flex flex-col gap-3 border-t border-border pt-3">
        {session.prescriptions.map((prescription, position) => (
          <li key={position}>
            {locked ? (
              <PrescriptionReadOnly prescription={prescription} />
            ) : (
              <PrescriptionEditor
                prescription={prescription}
                onEditField={(field, value) => onEditField(position, field, value)}
                onEditLoad={(loadKind, loadValue) =>
                  onEditLoad(position, loadKind, loadValue)
                }
              />
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PrescriptionReadOnly({
  prescription,
}: {
  prescription: DraftPrescription;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="truncate font-sans text-[13px] text-text-secondary">
        {prescription.exerciseName}
      </span>
      <span className="shrink-0 font-mono text-[12px] text-text-muted">
        {prescription.sets} × {prescription.reps}
      </span>
    </div>
  );
}

interface PrescriptionEditorProps {
  prescription: DraftPrescription;
  onEditField: (
    field: "sets" | "reps" | "restSeconds" | "tempo",
    value: string | number | null,
  ) => void;
  onEditLoad: (loadKind: LoadKind, loadValue: string) => void;
}

function PrescriptionEditor({
  prescription,
  onEditField,
  onEditLoad,
}: PrescriptionEditorProps) {
  const name = prescription.exerciseName;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3">
      <span className="font-display text-[14px] font-semibold text-text-primary">
        {name}
      </span>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Sets</span>
          <Input
            type="number"
            min={1}
            value={prescription.sets}
            aria-label={`Sets for ${name}`}
            onChange={(e) => onEditField("sets", toIntOrZero(e.target.value))}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Reps</span>
          <Input
            value={prescription.reps}
            aria-label={`Reps for ${name}`}
            placeholder="8-12"
            onChange={(e) => onEditField("reps", e.target.value)}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">
            Rest (sec)
          </span>
          <Input
            type="number"
            min={0}
            value={prescription.restSeconds ?? ""}
            aria-label={`Rest seconds for ${name}`}
            onChange={(e) =>
              onEditField(
                "restSeconds",
                e.target.value === "" ? null : toIntOrZero(e.target.value),
              )
            }
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Tempo</span>
          <Input
            value={prescription.tempo ?? ""}
            aria-label={`Tempo for ${name}`}
            placeholder="3-1-1"
            onChange={(e) =>
              onEditField("tempo", e.target.value === "" ? null : e.target.value)
            }
          />
        </label>
      </div>

      {/* Load is a typed value (ADR-0010): pick the kind, then give the value that
          kind carries — the same picker the log form uses. */}
      <div className="grid grid-cols-[7rem_1fr] gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Load kind</span>
          <Select
            value={prescription.loadKind}
            aria-label={`Load kind for ${name}`}
            onChange={(e) =>
              onEditLoad(e.target.value as LoadKind, prescription.loadValue)
            }
          >
            {LOAD_KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Load</span>
          <Input
            value={prescription.loadValue}
            placeholder="70"
            aria-label={`Load for ${name}`}
            onChange={(e) => onEditLoad(prescription.loadKind, e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

// Parse a numeric input to a non-negative integer, treating blanks/garbage as 0 so
// the draft field stays a number for the reducer.
function toIntOrZero(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}
