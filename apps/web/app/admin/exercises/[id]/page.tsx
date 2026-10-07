import { notFound } from "next/navigation";

import { resolveIsAdmin } from "@/lib/admin";
import {
  fetchAdminExercise,
  fetchAdminExerciseAudit,
  fetchAdminExerciseRelationships,
} from "@/lib/admin-exercises";
import { summarizeAuditEntry } from "@/lib/admin-exercise-curation";
import { bestEffortData, settleBestEffort } from "@/lib/best-effort-read";
import { AdminExerciseEditor } from "@/components/AdminExerciseEditor";
import { AdminExerciseCuration } from "@/components/AdminExerciseCuration";
import { AdminExerciseImage } from "@/components/AdminExerciseImage";
import { AdminExerciseEnrich } from "@/components/AdminExerciseEnrich";
import { AdminExerciseRelationships } from "@/components/AdminExerciseRelationships";
import { AdminExerciseRetire } from "@/components/AdminExerciseRetire";
import { AdminExerciseDelete } from "@/components/AdminExerciseDelete";
import { LocalInstant } from "@/components/pulse/local-instant";
import { PageHeader } from "@/components/pulse/page-header";
import { SectionHeader } from "@/components/pulse/section-header";
import { BackLink } from "@/components/pulse/back-link";

// The admin Exercise editor (issues #502 + #503, ADR-0075/0076 spec §5). #502 owns the
// descriptive edit; #503 adds the curator acts: the curator-only precautions field and the
// deliberate Provenance control — each a *separate* act with its own Save, never folded into
// the descriptive save (ADR-0075) — plus the read-only admin audit trail of Provenance
// changes. The admin gate is resolved server-side; a non-admin gets a 404 rather than a
// revealed-but-denied page, and the backend independently gates every write (`require_admin`,
// ADR-0046). The detail and the audit trail are fetched server-side (the JWT never reaches the
// browser); the thin Client Components own the edits. Each trail entry's instant is written by
// `LocalInstant`, so it reads in the admin's own clock and not the container's (ADR-0096).
export default async function AdminExerciseEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const isAdmin = await resolveIsAdmin();
  if (!isAdmin) notFound();

  const { id } = await params;
  const exerciseId = Number(id);
  if (!Number.isInteger(exerciseId)) notFound();

  // Three independent reads, settled together rather than in sequence (perf audit A2). The
  // admin gate above stays sequential on purpose — it must pass before anything admin-only is
  // fetched — but these three only take the id, so awaiting them one at a time bought nothing.
  // Only the detail read may reject; the other two are best-effort and `settleBestEffort` keeps
  // a flaky one from rejecting the whole settle (see `lib/best-effort-read.ts`):
  //
  //   - The audit trail is admin-only and best-effort for the page: if it fails to load, the
  //     editor still works — the trail simply renders empty rather than blocking the whole page.
  //   - The typed relationships (both directions) are likewise best-effort: if they fail to
  //     load, the rest of the editor still works — the manager simply starts empty.
  const [envelope, auditResult, relationshipsResult] = await Promise.all([
    fetchAdminExercise(exerciseId),
    settleBestEffort(fetchAdminExerciseAudit(exerciseId)),
    settleBestEffort(fetchAdminExerciseRelationships(exerciseId)),
  ]);

  if (!envelope.success || !envelope.data) notFound();

  const exercise = envelope.data;
  const auditTrail = bestEffortData(auditResult) ?? [];
  const relationships = bestEffortData(relationshipsResult) ?? [];

  return (
    <section className="flex flex-col gap-8">
      <PageHeader overline="PULSE // ADMIN" title="Edit exercise" />
      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        Correct this movement&rsquo;s descriptive content. Only the fields you change are
        saved. Renaming to another movement&rsquo;s name is rejected so two distinct
        exercises are never merged.
      </p>

      <AdminExerciseEditor exercise={exercise} />

      <AdminExerciseImage exercise={exercise} />

      <AdminExerciseCuration exercise={exercise} />

      <AdminExerciseRelationships
        exerciseId={exercise.id}
        relationships={relationships}
      />

      <AdminExerciseEnrich exercise={exercise} />

      <AdminExerciseRetire exercise={exercise} />

      <AdminExerciseDelete exercise={exercise} />

      <div className="flex flex-col gap-4">
        <SectionHeader meta={`${auditTrail.length} change${auditTrail.length === 1 ? "" : "s"}`}>
          Audit trail
        </SectionHeader>
        {auditTrail.length === 0 ? (
          <p className="font-mono text-[13px] text-text-muted">
            No provenance changes recorded yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {auditTrail.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-col gap-1 rounded-sm border border-border bg-surface px-3.5 py-2.5 font-mono text-[13px] sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-text-primary">
                  {summarizeAuditEntry(entry)}
                </span>
                <span className="text-[11px] text-text-muted">
                  {entry.actor} &middot; <LocalInstant iso={entry.created_at} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <BackLink href="/admin/exercises">Back to catalog</BackLink>
    </section>
  );
}
