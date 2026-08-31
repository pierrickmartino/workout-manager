import { StatRow } from "@/components/pulse/stat-row";
import { toStatTiles, type ExerciseRecords } from "@/lib/exercise-stats-view";
import type { WeightUnit } from "@/lib/weight-unit";

interface StatHeaderProps {
  records: ExerciseRecords;
  // The reader's Weight Unit, so the Personal Record tile renders in kg or lb (#417).
  unit: WeightUnit;
}

// The stat header over the SPECS / HISTORY / RECORDS tabs (ADR-0017): the user's
// Personal Record (highest Estimated 1RM) beside Total Sets for this Exercise. The
// PERSONAL RECORD tile is hidden — not zeroed — for a movement with no absolute-Load
// history, so a bodyweight or qualitative Exercise shows TOTAL SETS alone. Which tiles
// render is decided by the pure `toStatTiles` transform; this component only lays them
// out in the operator theme.
export function StatHeader({ records, unit }: StatHeaderProps): React.JSX.Element {
  return <StatRow stats={toStatTiles(records, unit)} />;
}
