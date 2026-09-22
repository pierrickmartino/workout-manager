// PROTOTYPE — throwaway route: `/prototype/muscle-atlas?variant=A|B|C`.
//
// A UI prototype (skill: prototype/UI.md) answering "what should a Sasha-style anatomical Muscle
// Atlas look like on our data?". Sub-shape B (new route) rather than folding into /analytics,
// because that screen is a Clerk-authed server component — a mock-data route runs from a bare
// `npm run dev` with no session, which is what matters for flipping variants. Delete this whole
// `app/prototype/muscle-atlas` folder + `components/prototype/` once a direction is chosen.

import { Suspense } from "react";

import { AtlasPrototypeClient } from "./prototype-client";

export const metadata = {
  title: "Muscle Atlas redesign — prototype",
  robots: { index: false, follow: false },
};

export default function MuscleAtlasPrototypePage() {
  return (
    <Suspense fallback={null}>
      <AtlasPrototypeClient />
    </Suspense>
  );
}
