import { Suspense } from "react";

import { CoverPrototype } from "@/app/prototype/workout-covers/cover-prototype";

// PROTOTYPE ROUTE — /prototype/workout-covers. Throwaway; answers "what should a workout cover
// look like?" across Dashboard / My sessions / Training hub / Session detail. Not linked from
// the app nav. The winning treatment gets folded into the real surfaces and this route deleted
// (see the throwaway branch captured on hand-off). `useSearchParams` needs a Suspense boundary.
export default function WorkoutCoversPrototypePage(): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <CoverPrototype />
    </Suspense>
  );
}
