import { ChartAccessibilityFixture } from "./chart-fixture";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import "./styles.css";
import "./fonts.css";
import { ProfileForm } from "@/components/ProfileForm";
import { SessionsLibrary } from "@/components/SessionsLibrary";
import { HistoryBrowser } from "@/components/HistoryBrowser";
import { ExerciseCatalogTaxonomy } from "@/components/ExerciseCatalogTaxonomy";
import { HandAuthoredSessionForm } from "@/components/HandAuthoredSessionForm";
import { LogSessionForm } from "@/components/LogSessionForm";
import { LiveSessionScreen } from "@/components/LiveSessionScreen";
import { AdhocLogForm } from "@/components/AdhocLogForm";
import { CorrectLogForm } from "@/components/CorrectLogForm";
import { correctionFieldsFromRecord } from "@/lib/log-correction";
import { GenerationProgress } from "@/components/GenerationProgress";
import { Skeleton } from "@/components/pulse/skeleton";
import { SyncStatusBanner } from "@/components/SyncStatusBanner";
import { NavigationGuardProvider } from "@/components/NavigationGuardProvider";
import { TabBar } from "@/components/pulse/tab-bar";
import { Sidebar } from "@/components/pulse/sidebar";
import { HomeColumns } from "@/components/pulse/home-columns";
import { SessionHero } from "@/components/pulse/session-hero";
import { CalibrationControl } from "@/components/pulse/calibration-control";
import { TrainingRouteCard } from "@/components/pulse/training-route";
import { QuickActions } from "@/components/pulse/quick-actions";
import { LevelBadge } from "@/components/pulse/level-badge";
import { Bento, BentoTile } from "@/components/pulse/bento";
import { SectionHeader } from "@/components/pulse/section-header";
import { RecentRecords } from "@/components/pulse/recent-records";
import { homeReview } from "@/lib/home-review";
import { quickActions } from "@/lib/quick-actions";
import { Card } from "@/components/ui/card";
import { AtlasDrawer } from "@/components/analytics/atlas-drawer";
import { VolumeChart } from "@/components/pulse/volume-chart";
import { DistanceChart } from "@/components/pulse/distance-chart";
import { toVolumeRows } from "@/lib/volume-view";
import { toDistanceBars } from "@/lib/distance-view";
import { Alert } from "@/components/pulse/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SpecsPanel } from "@/components/exercise/specs-panel";
import { AdminExerciseBrowser } from "@/components/AdminExerciseBrowser";
import { LocalInstant } from "@/components/pulse/local-instant";
import { ConfirmDialog } from "@/components/pulse/confirm-dialog";
import { BuildWorkoutLink, GenerateTrainingLaunchpad, LogPastWorkoutLink } from "@/components/pulse/generate-training-launchpad";
import { FitnessLevelStandings } from "@/components/pulse/fitness-level-standings";
import { toFitnessLevelRows } from "@/lib/fitness-level-standing";
import { adminExerciseRows, auditEntry, exerciseDetail, exerciseNames, exercises, history, personalRecords, prescriptions, profile, protocolProgress, sessions, taxonomy, volumePoints, workout } from "./fixtures";

const params = new URLSearchParams(location.search);
if (params.get("fonts") === "fontsource") {
  await import("./fonts-fontsource.css");
}
const journey = params.get("journey") ?? "profile";
const skin = params.get("skin") ?? "pulse";
const mode = params.get("mode") ?? "dark";
document.documentElement.dataset.skin = skin;
if (mode !== "system") document.documentElement.dataset.mode = mode;
const count = Math.min(10000, Math.max(0, Number(params.get("count") ?? 2)));

function Analytics() {
  const [open, setOpen] = useState(false);
  return <><VolumeChart rows={toVolumeRows(Array.from({ length: 20 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, volume_kg: (i + 1) * 100 })), "kg")} />
    <DistanceChart rows={toDistanceBars(Array.from({ length: 12 }, (_, i) => ({ week: `2026-07-${String(i + 1).padStart(2, "0")}`, km: i + 1 })))} />
    <Button onClick={() => setOpen(true)}>Open muscle details</Button>
    <AtlasDrawer onClose={() => setOpen(false)} weeksLabel="last 8 weeks" region={open ? {
      muscle: "Quadriceps", group: "Legs", covered: true, stateLabel: "Trained", sets: 1000,
      intensity: 1, ariaLabel: "Quadriceps", contributingExercises: Array.from({ length: 100 }, (_, i) => ({ name: `${exerciseNames[i % 2]} ${i}`, sets: 10 })),
    } : null} /></>;
}

function ContrastSamples() {
  return <><div className="flex flex-col gap-4">{["base", "surface", "elevated"].map(surface =>
    <div key={surface} data-surface={surface} style={{ background: `var(--color-${surface})` }} className="p-4">
      {["primary", "secondary", "muted"].map(rung => <p key={rung} data-rung={rung} style={{ color: `var(--color-text-${rung})` }} className="label-mono text-[10px]">{surface} {rung}</p>)}
      {["cyan", "blue", "violet", "magenta", "amber", "green"].map(accent => <div key={accent}>
        <p style={{ color: `var(--color-${accent})` }} className="text-sm">{surface} {accent} flat</p>
        {accent !== "blue" && <p style={{ color: `var(--color-${accent})`, background: `var(--color-${accent}-dim)` }} className="text-sm">{surface} {accent} tint</p>}
      </div>)}
      <Badge variant="muted">Metadata</Badge><Button>Continue</Button><Button disabled>Disabled</Button>
      <Alert tone="error">Error feedback</Alert>
    </div>)}</div></>;
}

// Home at the shell's wide width (ADR-0088). Mounted through the *same* `HomeColumns` the real
// page uses, so this measures Home's layout rather than a copy that would drift; the review
// column's blocks come from the same `homeReview` view-model over synthetic analytics data.
// The journey's root carries `data-shell="wide"`, making it the one case in the sweep that
// exercises the wide content column rather than only the wide frame.
const operatorLevel = { level: 7, xp_into_level: 200, xp_span_of_level: 800, xp_to_next: 600 };

function Home() {
  const review = homeReview(
    { success: true, data: {
      range: "30d", available_ranges: ["30d"], sessions: 12, active_days: 9, total_sets: 120,
      muscle_distribution: [], recent_records: personalRecords, new_prs: 3,
      volume: { points: volumePoints, coverage: 78, delta: 12 },
      distance: { weeks: [], delta: null, has_distance: false },
      coverage: { weeks: 8, groups: [], unclassified_present: false, unclassified_sets: 0,
        muscles: { items: [], unclassified_present: false, unclassified_volume: 0 } },
    } },
    "kg",
  );
  return (
    <div data-shell="wide" className="flex flex-col gap-7">
      <HomeColumns
        main={<>
          <SessionHero protocol={protocolProgress} />
          {/* The Calibration control (ADR-0111), mounted in *both* of its states, because the
              rail is the one that renders prose: at the authored pitch the card is a label plus
              two single-word buttons, while at the rail it adds a multi-sentence note and a
              third button — the shape that actually stresses 320px and 200% text. A surface
              only one of whose states is rendered here is only half measured, which is the
              lesson the `confirm` journey records. */}
          <Card className="p-5">
            <CalibrationControl protocol={protocolProgress} />
          </Card>
          <Card className="p-5">
            <CalibrationControl protocol={{ ...protocolProgress, calibration: -3 }} />
          </Card>
          <TrainingRouteCard protocol={protocolProgress} />
          <QuickActions actions={quickActions({
            readiness: "READY", current_protocol: protocolProgress,
            gamification: { xp: 4200, level: operatorLevel, streak: 3 }, latest_pr: null,
          })} />
          {review.volume ? (
            <div className="hidden flex-col gap-4 lg:flex">
              <SectionHeader>TOTAL VOLUME</SectionHeader>
              <Card className="flex flex-col gap-4 p-6">
                <VolumeChart rows={review.volume.rows} />
                <p className="label-mono text-[11px] text-text-muted">{review.volume.coverageCaption}</p>
              </Card>
            </div>
          ) : null}
          {review.records ? (
            <div className="hidden lg:block">
              <RecentRecords rows={review.records.rows} teaser={review.records.teaser} />
            </div>
          ) : null}
        </>}
        rail={<>
          <SectionHeader>OPERATOR STATUS</SectionHeader>
          <LevelBadge xp={4200} level={operatorLevel} />
          <Bento>
            <BentoTile label="STREAK" value={3} caption="WEEKS" span="full" />
          </Bento>
        </>}
      />
    </div>
  );
}

// The two admin surfaces this change touched, in one journey. The audit trail's row markup
// lives in a Server Component page, so the row is replicated here from its classes rather than
// imported — what is measured is `LocalInstant`'s own text, which is the longest thing in it.
function AdminAudit() {
  return <div className="flex flex-col gap-8">
    <AdminExerciseBrowser rows={adminExerciseRows} />
    <div className="flex flex-col gap-4">
      <SectionHeader meta="1 change">Audit trail</SectionHeader>
      <ul className="flex flex-col gap-2">
        <li className="flex flex-col gap-1 rounded-sm border border-border bg-surface px-3.5 py-2.5 font-mono text-[13px] sm:flex-row sm:items-center sm:justify-between">
          <span className="text-text-primary">Provenance: AI-generated → Curated</span>
          <span className="text-[11px] text-text-muted">{auditEntry.actor} &middot; <LocalInstant iso={auditEntry.createdAt} /></span>
        </li>
      </ul>
    </div>
  </div>;
}

// The themed confirmation that replaced `window.confirm` at the three destructive actions
// (ADR-0098). It is `fixed inset-0` and renders only while mounted, so no other journey ever
// shows one — and an unrendered surface is an unmeasured one, whatever the static guards say
// (ADR-0088). The copy is the longest of the three in each slot: the supersede's warning names
// a Protocol, and the admin delete's two-line consequence is the longest message.
function ConfirmSurface() {
  return <ConfirmDialog
    title="Permanently delete this exercise?"
    message={'This cannot be undone. The movement is removed from the shared catalog outright, not retired. You\u2019re partway through \u201CPosterior Chain Rebuild \u2014 Weeks 1\u20134\u201D.'}
    confirmLabel="Delete permanently"
    cancelLabel="Keep current"
    onConfirm={() => {}}
    onCancel={() => {}}
  />;
}

// Both of the launchpad's compositions, in one capture (ADR-0109): the TRAIN tab's four cards
// above the Home empty state's two. Neither was in any journey — the `home` journey mounts the
// *protocol-present* path, so the empty state's launchpad never rendered either — and this is a
// stack of full-width buttons whose labels are authored sentences, the shape a doubled root font
// is most likely to push past a 320px viewport. It does not: the labels wrap (142px chips at 200%
// text, document still 320) — but at that size a wrapped label needs 103px inside `h-11`'s fixed
// 88px box, which this harness does not gate and `creation` has always shown too (ADR-0109).
function LaunchpadSurface() {
  return <div className="flex flex-col gap-6">
    <GenerateTrainingLaunchpad eyebrow="TRAIN // START SOMETHING NEW" from="/train">
      <BuildWorkoutLink />
      <LogPastWorkoutLink />
    </GenerateTrainingLaunchpad>
    <GenerateTrainingLaunchpad eyebrow="GET STARTED // NO ACTIVE PROTOCOL" from="/dashboard" />
  </div>;
}

// The Profile view's Fitness Level section (ADR-0112): Declared read against Effective, per
// Training Type. Nothing on the Profile *view* page had ever been in a journey — `profile`
// mounts the edit form — so this is the harness's first look at it. Both of the section's
// states are in one mount, because the rows differ by construction: strength has earned
// notches (the accented reading plus the longer sentence), yoga reads at exactly its declared
// level (the equal case, which is stated rather than blank), and the third row is a Training
// Type outside the curated five, which is the longest label the section can be handed and the
// one that stresses the row's `min-w-0 break-words` pairing (ADR-0085).
function FitnessLevelSurface() {
  return <FitnessLevelStandings rows={toFitnessLevelRows([
    { training_type: "strength", declared: 6, effective: 10 },
    { training_type: "yoga", declared: 2, effective: 2 },
    { training_type: "handstand and tumbling conditioning", declared: 4, effective: 5 },
  ])} />;
}

function Content() {
  switch (journey) {
    case "charts": return <ChartAccessibilityFixture />;
    case "motion": return <><GenerationProgress /><Skeleton className="h-12" /><SyncStatusBanner /></>;
    case "adhoc": return <AdhocLogForm today="2026-09-26" unit="kg" />;
    case "correction": return <CorrectLogForm logId={1} fields={correctionFieldsFromRecord(history(1)[0], "kg")} today="2026-09-26" unit="kg" />;
    case "profile": return <ProfileForm profile={profile} submitLabel="Save profile" />;
    case "sessions": return <SessionsLibrary sessions={count === 0 ? [] : sessions} />;
    case "history": return <HistoryBrowser records={history(count)} unit="kg" />;
    case "catalog": return <ExerciseCatalogTaxonomy initialFilters={{ query: "", muscleGroups: [], equipment: [], difficulty: [] }} initialTaxonomy={count === 0 ? { groups: [], total: 0 } : count > 50 ? { total: count, groups: [{ pattern: "squat", count, exercises: Array.from({ length: count }, (_, i) => ({ ...exercises[i % 50], id: i + 1 })) }] } : taxonomy} equipmentOptions={["barbell", "dumbbell"]} myEquipment={["barbell"]} usage={[]} referenceIso="2026-09-26" unit="kg" />;
    case "creation": return <HandAuthoredSessionForm draftId="audit-only" today="2026-09-26" unit="kg" mode="planOnly" seed={{ trainingType: "strength", exercises: exercises.slice(0, 3).map(exercise => ({ exerciseId: exercise.id, exerciseName: exercise.name, kind: "repetitions", unit: "km", sets: "3", reps: "12", loadKind: "bodyweight", loadValue: "" })) }} />;
    // The same Hand-Authored form in its default `authorAndLog` flow. The matrix only ever
    // mounted `planOnly` (Capture), which hides the "SETS PERFORMED" half — so the performed-set
    // grid was never rendered in any recorded capture. This case measures it.
    //
    // The third row is a **distance**, which is what renders the performed-set `<fieldset>`
    // (ADR-0108's `FieldGroup`, holding ADR-0032's distance-and-time pair). Every row here was
    // `repetitions`, so that branch — the widest of the three, three controls under one caption —
    // was renderable and rendered by no journey, and a fieldset is precisely the box ADR-0085
    // floors at its content's minimum width. The reps rows stay beside it, so one capture holds
    // both shapes.
    case "creation-logged": return <HandAuthoredSessionForm draftId="audit-only-logged" today="2026-09-26" unit="kg" seed={{ trainingType: "strength", exercises: exercises.slice(0, 3).map((exercise, index) => index === 2 ? ({ exerciseId: exercise.id, exerciseName: exercise.name, kind: "distance" as const, unit: "km" as const, sets: "3", reps: "5", loadKind: "bodyweight" as const, loadValue: "" }) : ({ exerciseId: exercise.id, exerciseName: exercise.name, kind: "repetitions" as const, unit: "km" as const, sets: "3", reps: "12", loadKind: "bodyweight" as const, loadValue: "" })) }} />;
    case "logging": return <LogSessionForm sessionId={1} prescriptions={prescriptions} today="2026-09-26" unit="kg" />;
    case "live": return <LiveSessionScreen session={workout} today="2026-09-26" defaultRestSeconds={60} keepScreenAwake={false} unit="kg" />;
    case "analytics": return <Analytics />;
    case "home": return <Home />;
    // The Exercise detail page's SPECS lens, which carries the framed illustration (ADR-0095).
    // Its box is reserved by the layout rather than by the image, so this measures the box the
    // page actually holds open while the bytes never arrive.
    case "exercise": return <SpecsPanel exercise={exerciseDetail} topSetSeries={[]} unit="kg" />;
    // The admin catalog browser (ADR-0097) and, beneath it, one audit-trail row in the shape
    // the admin editor renders it — the reader's-clock instant (ADR-0096) is the longest text
    // in that row. Neither admin screen was in any journey before.
    case "admin": return <AdminAudit />;
    case "confirm": return <ConfirmSurface />;
    case "launchpad": return <LaunchpadSurface />;
    case "levels": return <FitnessLevelSurface />;
    case "contrast": return <ContrastSamples />;
    default: throw new Error(`Unknown audit journey: ${journey}`);
  }
}

// Shell spacing copied from RootLayout, both widths (ADR-0088); Clerk chrome is replaced with
// an inert account label. `?admin=1` mounts the sidebar's admin entry, which the real shell
// renders from a server-resolved role claim this harness has no way to hold.
const isAdmin = params.get("admin") === "1";
createRoot(document.getElementById("root")!).render(<NavigationGuardProvider>
  <div className="lg:flex">
    <Sidebar isAdmin={isAdmin} />
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-base/90 pt-[env(safe-area-inset-top)] backdrop-blur"><div className="mx-auto flex h-14 max-w-shell items-center justify-between px-6 lg:max-w-shell-wide"><span className="label-mono text-[13px] font-bold tracking-[0.2em]">PULSE //</span><span className="label-mono text-[10px] text-text-muted">Synthetic account</span></div></header>
      <main id="main-content" className="mx-auto min-h-[calc(100vh-3.5rem)] w-full max-w-shell px-6 pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:max-w-shell-wide lg:pb-16" data-journey={journey}>
        {/* The content column. No journey here opts in with `data-shell="wide"`, which is the
            point: `audit/wide.mjs` gates on an unconverted page staying 26rem inside the wide
            frame. Converting a journey means adding that attribute to its own root. */}
        <div data-shell-column className="mx-auto w-full lg:max-w-shell lg:has-[[data-shell=wide]]:max-w-shell-wide"><Content /><p className="mt-6 text-sm text-text-muted">End of synthetic fixture</p></div>
      </main>
    </div>
  </div>
  <TabBar />
</NavigationGuardProvider>);
