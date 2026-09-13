import { notFound } from "next/navigation";

import { resolveIsAdmin } from "@/lib/admin";
import { fetchAdminExercise } from "@/lib/admin-exercises";
import { AdminExerciseEditor } from "@/components/AdminExerciseEditor";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";

// The admin Exercise editor (issue #502, ADR-0075/0076 spec §5): an operator corrects one
// Catalog Exercise's descriptive content — display name, description, Execution Steps,
// targeted muscles, required equipment, difficulty — and its Primary/Secondary emphasis
// split. Provenance, precautions, the Image, and retire/delete are each a separate
// deliberate act handled elsewhere. The admin gate is resolved server-side; a non-admin
// gets a 404 rather than a revealed-but-denied page, and the backend independently gates the
// PATCH (`require_admin`, ADR-0046). The current detail is fetched server-side (the JWT
// never reaches the browser) to seed the form; the thin client component owns the edits and
// drives the save action, which surfaces the 409 name-collision error.
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

  const envelope = await fetchAdminExercise(exerciseId);
  if (!envelope.success || !envelope.data) notFound();

  const exercise = envelope.data;

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // ADMIN" title="Edit exercise" />
      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        Correct this movement&rsquo;s descriptive content. Only the fields you change are
        saved. Renaming to another movement&rsquo;s name is rejected so two distinct
        exercises are never merged.
      </p>

      <AdminExerciseEditor exercise={exercise} />

      <BackLink href="/admin/exercises">Back to catalog</BackLink>
    </section>
  );
}
