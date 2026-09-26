import { VolumeChart } from "@/components/pulse/volume-chart";
import { DistanceChart } from "@/components/pulse/distance-chart";
import { TopSetTrendChart } from "@/components/exercise/top-set-trend-chart";
import { StrengthTrajectories } from "@/components/analytics/strength-trajectories";
import { MuscleBalance } from "@/components/analytics/muscle-balance";
import { MuscleSplit } from "@/components/pulse/muscle-split";
import { MuscleRegionAtlas } from "@/components/analytics/muscle-region-atlas";
import { toMuscleBalance } from "@/lib/muscle-balance-view";
import { toStrengthTrajectories } from "@/lib/strength-trajectories-view";
import { toMuscleBars } from "@/lib/muscle-distribution";
import { kgToUnit } from "@/lib/weight-format";
import type { Figure } from "@/lib/atlas/atlas-geometry";
import type { MuscleRegionAtlasView } from "@/lib/muscle-region-atlas-view";

// Fixtures pass data through production mappers; no accessible fallback is added here.
const params = new URLSearchParams(location.search);
const variant = params.get("variant") ?? "multi";
const range = [30, 90, 150].includes(Number(params.get("range"))) ? Number(params.get("range")) : 30;
const unit = params.get("unit") === "lb" ? "lb" : "kg";
const figure: Figure = params.get("figure") === "female" ? "female" : params.get("figure") === "male" ? "male" : "neutral";
const length = variant === "empty" ? 0 : variant === "single" ? 1 : variant === "large" ? range : 4;
const iso = (offset: number) => new Date(Date.UTC(2025, 11, 22 + offset)).toISOString().slice(0, 10);
const label = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const dates = Array.from({ length }, (_, i) => iso(i * (variant === "sparse" ? 7 : 1)));
const volume = dates.map((date, i) => ({ date, label: label(date), volume: kgToUnit(1234.6 + i * 97.3, unit) }));
const distance = Array.from({ length: length === 0 ? 0 : variant === "large" ? Math.ceil(range / 7) : length }, (_, i) => ({ week: iso(i * 7), label: label(iso(i * 7)), km: variant === "sparse" && i === 1 ? 0 : 1.125 + i * 0.375 }));
// Top-set production is capped at eight qualifying sessions; large means its maximum.
const series = dates.slice(0, 8).map((date, i) => ({ date, estimated_1rm: 80.6 + i * 2.25 }));
const tiles = toStrengthTrajectories(series.length ? [{ exercise_id: 1, exercise: "Synthetic Squat", series }] : [], unit);
const shares = length ? [{ group: "Legs", pct: 66.6 }, { group: "Core", pct: 33.4 }] : [];
const balance = toMuscleBalance(distance.map((row, i) => ({ week: row.week, groups: variant === "sparse" && i === 1 ? [] : shares })));
const regions = ["Quadriceps", "Hamstrings", "Rectus Abdominis"].map((muscle, i) => {
  const sets = length && i !== 1 ? (variant === "large" ? 100 : i === 0 ? 10 : 4) : 0;
  return { muscle, group: i === 2 ? "Core" : "Legs", covered: sets > 0, stateLabel: sets ? "Trained" : "Not trained", sets,
    intensity: sets ? (i === 0 ? 1 : 0.2) : 0,
    contributingExercises: sets ? Array.from({ length: variant === "large" ? 100 : 1 }, (_, j) => ({ name: `Synthetic Exercise ${j + 1}`, sets: variant === "large" ? 1 : sets })) : [],
    ariaLabel: `${muscle}: ${sets ? "trained" : "not trained"} in the last 8 weeks, ${sets} sets` };
});
const atlas: MuscleRegionAtlasView = { weeksLabel: "last 8 weeks", regions, groups: ["Legs", "Core"].map(group => {
  const muscles = regions.filter(region => region.group === group);
  const trainedCount = muscles.filter(region => region.covered).length;
  return { group, muscles, trainedCount, muscleCount: muscles.length, covered: trainedCount > 0, stateLabel: trainedCount ? "Trained" : "Not trained", ariaLabel: `${group}: ${trainedCount} of ${muscles.length} muscles trained in the last 8 weeks` };
}), isEmpty: length === 0, footnote: null, unclassifiedVolume: 0 };

export function ChartAccessibilityFixture() {
  const surface = params.get("surface") ?? "volume";
  const components = {
    volume: <VolumeChart rows={volume} unit={unit} />,
    distance: <DistanceChart rows={distance} />,
    top: tiles.length ? <TopSetTrendChart rows={tiles[0].trend.rows} unit={unit} /> : <p>No qualifying strength history.</p>,
    miniature: <StrengthTrajectories tiles={tiles} unit={unit} />,
    balance: <MuscleBalance view={balance} />,
    split: <MuscleSplit bars={toMuscleBars(shares)} emptyMessage="No muscle data." />,
    atlas: <MuscleRegionAtlas view={atlas} figure={figure} />,
  };
  // Expected inputs are in an inert JSON script, excluded from the accessibility tree.
  return <><h1>Chart validation fixture</h1><section data-chart-surface={surface}>{components[surface as keyof typeof components]}</section>
    <script type="application/json" id="chart-inputs">{JSON.stringify({ volume, distance, tiles, balance, shares, atlas, range, variant, unit, figure })}</script></>;
}
