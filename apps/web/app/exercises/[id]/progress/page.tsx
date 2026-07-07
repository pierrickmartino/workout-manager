import { redirect } from "next/navigation";

// The per-exercise progress view was folded into the Exercise Detail HISTORY tab
// (F6 Slice 1, ADR-0017). This route is kept only so existing links and bookmarks
// keep working: it permanently redirects to the detail page's HISTORY tab.
export default async function ExerciseProgressPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/exercises/${id}?tab=history`);
}
