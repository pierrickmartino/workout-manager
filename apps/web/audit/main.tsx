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
import { NavigationGuardProvider } from "@/components/NavigationGuardProvider";
import { TabBar } from "@/components/pulse/tab-bar";
import { AtlasDrawer } from "@/components/analytics/atlas-drawer";
import { VolumeChart } from "@/components/pulse/volume-chart";
import { DistanceChart } from "@/components/pulse/distance-chart";
import { Alert } from "@/components/pulse/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { exerciseNames, exercises, history, names, prescriptions, profile, sessions, taxonomy, workout } from "./fixtures";

const params = new URLSearchParams(location.search);
const journey = params.get("journey") ?? "profile";
const skin = params.get("skin") ?? "pulse";
const mode = params.get("mode") ?? "dark";
document.documentElement.dataset.skin = skin;
if (mode !== "system") document.documentElement.dataset.mode = mode;
const count = Math.min(10000, Math.max(0, Number(params.get("count") ?? 2)));

function Analytics() {
  const [open, setOpen] = useState(false);
  return <><VolumeChart unit="kg" rows={Array.from({ length: 20 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, label: `Sep ${i + 1}`, volume: (i + 1) * 100 }))} />
    <DistanceChart rows={Array.from({ length: 12 }, (_, i) => ({ week: `2026-07-${String(i + 1).padStart(2, "0")}`, label: `Week ${i + 1}`, km: i + 1 }))} />
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
      <Badge variant="muted">Metadata</Badge><Button>Continue</Button><Button disabled>Disabled</Button>
      <Alert tone="error">Error feedback</Alert>
    </div>)}</div></>;
}

function Content() {
  switch (journey) {
    case "motion": return <><GenerationProgress /><Skeleton className="h-12" /></>;
    case "adhoc": return <AdhocLogForm today="2026-09-26" unit="kg" />;
    case "correction": return <CorrectLogForm logId={1} fields={correctionFieldsFromRecord(history(1)[0], "kg")} today="2026-09-26" unit="kg" />;
    case "profile": return <ProfileForm profile={profile} submitLabel="Save profile" />;
    case "sessions": return <SessionsLibrary sessions={count === 0 ? [] : sessions} />;
    case "history": return <HistoryBrowser records={history(count)} unit="kg" />;
    case "catalog": return <ExerciseCatalogTaxonomy initialFilters={{ query: "", muscleGroups: [], equipment: [], difficulty: [] }} initialTaxonomy={count === 0 ? { groups: [], total: 0 } : count > 50 ? { total: count, groups: [{ pattern: "squat", count, exercises: Array.from({ length: count }, (_, i) => ({ ...exercises[i % 50], id: i + 1 })) }] } : taxonomy} equipmentOptions={["barbell", "dumbbell"]} myEquipment={["barbell"]} usage={[]} referenceIso="2026-09-26" unit="kg" />;
    case "creation": return <HandAuthoredSessionForm draftId="audit-only" today="2026-09-26" unit="kg" mode="planOnly" seed={{ trainingType: "strength", exercises: exercises.slice(0, 3).map(exercise => ({ exerciseId: exercise.id, exerciseName: exercise.name, kind: "repetitions", unit: "km", sets: "3", reps: "12", loadKind: "bodyweight", loadValue: "" })) }} />;
    case "logging": return <LogSessionForm sessionId={1} prescriptions={prescriptions} today="2026-09-26" unit="kg" />;
    case "live": return <LiveSessionScreen session={workout} today="2026-09-26" defaultRestSeconds={60} keepScreenAwake={false} unit="kg" />;
    case "analytics": return <Analytics />;
    case "contrast": return <ContrastSamples />;
    default: throw new Error(`Unknown audit journey: ${journey}`);
  }
}

// Shell spacing copied from RootLayout; Clerk chrome is replaced with an inert account label.
createRoot(document.getElementById("root")!).render(<NavigationGuardProvider>
  <header className="sticky top-0 z-30 border-b border-border bg-base/90 pt-[env(safe-area-inset-top)] backdrop-blur"><div className="mx-auto flex h-14 max-w-shell items-center justify-between px-6"><span className="label-mono text-[13px] font-bold tracking-[0.2em]">PULSE //</span><span className="label-mono text-[10px] text-text-muted">Synthetic account</span></div></header>
  <main id="main-content" className="mx-auto min-h-[calc(100vh-3.5rem)] w-full max-w-shell px-6 pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))]" data-journey={journey}><Content /><p className="mt-6 text-sm text-text-muted">End of fixture: {names[0]}</p></main><TabBar />
</NavigationGuardProvider>);
