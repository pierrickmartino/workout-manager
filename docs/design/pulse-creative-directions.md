# PULSE — Creative directions and component resources

Prepared: 11 September 2026.

This proposal builds on the 12 screens in [polish.pen](polish.pen) and the [UI/UX review](polish-ui-ux-review.md). It combines researched external resources with original concepts for PULSE. The concepts are proposals, not features supplied out of the box by the linked libraries. Resources were checked on the date above; no packages were installed or prototypes implemented.

## Recommended direction: a personal training atlas

Make PULSE feel like a beautifully designed record of someone's training: distinctive workout cards, a visible route through a training plan, and a growing collection of accomplishments. Carry one recognizable graphic language across Home, Train, Stats, and Profile.

The signature motif: **a segmented training line**. Its segments represent actual exercises, sets, or completed workouts according to context. Use it on a workout cover, the live-session progress indicator, the weekly plan, and the completion card. Always label its meaning; decorative versions should not resemble a measured heart-rate trace.

Keep the current teal, rounded surfaces, clear headings, and four navigation destinations. Add personality through custom composition, data-driven artwork, and a few memorable moments.

### Three directions worth sketching

| Direction | Visual character | Signature element | Best fit | Tradeoff |
| --- | --- | --- | --- | --- |
| **Training Atlas — recommended** | Warm pale surfaces, ink typography, teal routes, occasional violet milestones | A plan route and workout-specific graphic | Daily training and long-term progress | Requires custom illustration and clear data mapping |
| Kinetic Studio | Large numerals, strong crops, vivid color fields, spacious composition | A focused timer and bold completion poster | Live workouts and a more athletic brand | Can overwhelm dense analytics if used everywhere |
| Field Journal | Fine rules, numbered entries, restrained texture, small achievement stamps | A personal training passport | History, reflection, and consistency | Must retain strong contrast and comfortable type sizes |

Use Training Atlas as the foundation, with Kinetic Studio's timer and Field Journal's achievement stamps. Share typography, spacing, and interaction rules across them.

## External resource shortlist

| Resource | Useful starting point | How it fits PULSE |
| --- | --- | --- |
| [21st.dev](https://21st.dev/) | A registry of components and themes from multiple authors; copied source can be adapted locally | Discover two or three treatments, then rewrite them around PULSE's tokens and actual content |
| [Expandable by cult/ui on 21st.dev](https://21st.dev/%40cult-ui/components/expandable) | Expandable card examples; the listing includes `framer-motion` and `react-use-measure` dependencies | Compact workout overview with an explicit detail action |
| [Aceternity Timeline](https://ui.aceternity.com/components/timeline) | Timeline with a sticky heading and scroll-following treatment | Reference for the visual structure of a multi-week plan |
| [Magic UI Number Ticker](https://magicui.design/docs/components/number-ticker) and [Confetti](https://magicui.design/docs/components/confetti) | Animated numeric changes and celebration effects | A brief, earned milestone moment after saving a completed workout |
| [React Bits](https://reactbits.dev/get-started/index) | Expressive backgrounds and interactive visual components | Inspiration for workout cover art and a carefully scoped visual experiment |
| [Motion Primitives Morphing Dialog](https://motion-primitives.com/docs/morphing-dialog) | A card-to-detail transition pattern | Reference for continuity when opening exercise details |
| [shadcn/ui Drawer](https://ui.shadcn.com/docs/components/drawer) and [Chart](https://ui.shadcn.com/docs/components/chart) | Composable detail surfaces and chart presentation | A practical foundation for the exercise picker and readable progress stories |
| [Rive React runtime](https://rive.app/docs/runtimes/react/react) | Rendering and controlling authored `.riv` assets in React | Optional custom achievement illustration when a static badge proves valuable |
| [Motion reduced-motion support](https://motion.dev/docs/react-use-reduced-motion) | A hook for adapting animation to user preferences | Shared motion behavior if the prototypes justify adding Motion |

Treat 21st.dev as a discovery and source-code resource. Select the author and component explicitly; a whole registry does not provide one consistent design system. Premium templates and individual asset terms should be checked for the selected item before adoption. This proposal does not require buying a template.

## Ten concrete ideas

### 1. Give every workout a recognizable cover

**Where:** Dashboard, My sessions, training hub, and session detail — screens 01–04.

Replace interchangeable white cards with a distinctive cover strip: workout name, a short exercise signature, and a custom geometric mark. A five-exercise workout could show five differently sized blocks in a consistent order. Repeating the same workout preserves its mark, helping users distinguish the two “Calisthenics” entries in the current screenshots.

Use a restrained palette by training type, always accompanied by a text label. Keep the name and Start action fully readable. The cover can be expressive while the prescription below stays quiet.

**Resource:** Adapt the composition and reveal pattern from [21st.dev's Expandable](https://21st.dev/%40cult-ui/components/expandable). Create the graphic with local SVG and CSS. The component is an interaction reference; the workout identity system is custom work.

**First prototype:** Three cards with long and duplicate names, each with a cover, last-completed date, and separate Start and Details actions. Make the resting state attractive before adding any transition.

**Effort:** Medium. Existing workout IDs and exercise lists are enough; stable artwork generation needs a defined mapping.

### 2. Turn the plan into a readable training route

**Where:** Dashboard week strip and full training-plan view.

Show the current week as a short route with named stops: “Upper A,” “Lower A,” “Upper B,” “Lower B.” Completed stops receive a solid marker; the next stop has a clearly labeled outline; later stops remain readable. An expandable week list reveals the rest of the plan.

The route becomes a recognizable PULSE pattern while replacing the current tiny, ambiguous dots. Separate “session 1 of 32” from “0 completed.” Keep rest days visually distinct from missed sessions when dates actually exist in the plan.

**Resource:** Use [Aceternity's Timeline](https://ui.aceternity.com/components/timeline) as a composition reference. Adapt it into a compact mobile route with explicit buttons. Scroll position must never stand in for workout completion.

**First prototype:** Current week, completed week, and an unscheduled plan. Include a plain list alternative. Avoid inventing calendar dates for a plan defined only by sequence.

**Effort:** Medium. Plan/session status is available conceptually; scheduled dates may require additional data.

### 3. Create a signature rest-timer instrument

**Where:** Live session — an additional state to add to the design board.

Build a calm, oversized countdown inside a segmented circular instrument. Around it, show only the information needed now: “Rest,” remaining time, and the next exercise/set. Keep “−15 s,” “Skip rest,” and “+15 s” in fixed positions below it.

At rest completion, the same area becomes “Ready for set 2.” A subtle color change gives closure. The timer is the defining visual of the active workout, with the next action immediately available.

**Resource:** [Magic UI's Animated Circular Progress Bar](https://magicui.design/docs/components/animated-circular-progress-bar) is a visual reference. A custom SVG with discrete progress updates may be a better final implementation than its default animation.

**First prototype:** Running, adjusted, elapsed, and restored-after-backgrounding states. Derive remaining time from the timer deadline; animation must not determine timekeeping. Keep numerals stable and announce meaningful state changes rather than every second.

**Effort:** Medium. The live-session logic exists, but backgrounding and timer accuracy need device testing.

### 4. Make exercise discovery feel like opening a field guide

**Where:** Exercise catalog, builder picker, and exercise detail — screens 05–06.

Give each exercise a small, consistent line illustration, a plain-language muscle summary, and an equipment symbol. Opening Details reveals instructions, alternatives, and past performance in a focused panel. Keep the search and selected filters intact behind it.

Start with broad movement families such as squat, hinge, push, pull, carry, and locomotion. These can give the library visual variety without requiring 107 bespoke animations. Use an illustrated generic movement only when it accurately represents the exercise.

**Resources:** Study [Motion Primitives' Morphing Dialog](https://motion-primitives.com/docs/morphing-dialog) for spatial continuity and [shadcn/ui Drawer](https://ui.shadcn.com/docs/components/drawer) for a mobile detail surface. Use the existing Lucide icons for equipment where appropriate; commission or create original SVG movement illustrations.

**First prototype:** Six illustrated exercise families, long-name handling, search results, and one detail drawer. Make Details and Add separate actions. Keyboard activation opens immediately; preserve focus and provide a close control.

**Effort:** Medium–large. The main cost is good artwork and accurate classification.

### 5. Give the builder a visible workout composition

**Where:** Workout builder — screen 05.

Above the editable exercises, show a compact composition strip: warm-up, main work, accessories, and cooldown where those roles are explicitly defined. Each added exercise creates a labeled tile in the strip. Selecting it moves focus to its editable prescription.

Visually bracket superset pairs and show one shared round instruction. This turns the builder into a composition tool and makes grouping understandable before users inspect every field.

**Resources:** Reuse the project's installed `@dnd-kit/core` and `@dnd-kit/sortable` rather than introducing another drag system. Use the expandable-card reference from idea 1 for collapsed exercise summaries. All category assignments and grouping rules remain product logic.

**First prototype:** Three exercises, one superset, adding an exercise, and removing it with Undo. Keep explicit Move up/Move down buttons alongside drag. On narrow screens, stack fields and keep Save within the page shell.

**Effort:** Medium–large. Warm-up/accessory roles are new data unless the current model already supplies them; start with ordered exercises only.

### 6. Show progress as a short, verifiable story

**Where:** Analytics and Strength analytics — screens 07–08.

Lead with one clear statement tied to the selected exercise and range: “Pull-ups: 2 more reps at the same added weight,” when the records support that exact comparison. Under it, show the two comparable performances and a small chart with units. Let users inspect the source sessions.

The creative element is an editorial layout: a strong headline, a compact comparison, and a restrained accent line. It gives the numbers meaning without making the page longer.

**Resource:** [shadcn/ui Chart](https://ui.shadcn.com/docs/components/chart) provides a presentation reference. Keep the existing Recharts foundation unless a specific requirement justifies a change; check installed-version compatibility before copying current examples.

**First prototype:** An improvement, unchanged performance, and insufficient comparable data. Use deterministic summaries first. Fix the current chart scale and measurement definitions before styling this screen.

**Effort:** Medium for presentation; larger if the data needs a new comparison model. Never combine bodyweight, added load, assisted load, timed holds, and repetitions as if they were interchangeable.

### 7. Build a personal training passport

**Where:** Profile and achievements — screen 10 and its achievement detail state.

Replace repeated trophy cards with a collection of original achievement stamps: first workout, first month of consistency, 25 completed workouts, and a personal best. Each stamp has a date, short title, and its own small geometric illustration.

Show the next achievable milestone beside earned stamps. Opening a stamp explains what earned it and links to the relevant workout. Use a collection layout with readable labels rather than a wall of locked icons.

**Resources:** Start with custom SVG. If users respond well to the collection, use [Rive's React runtime](https://rive.app/docs/runtimes/react/react) for a single authored award reveal. Rive supplies playback capability; the original art and state design still need to be created.

**First prototype:** Four earned stamps, one in progress, and the first-workout empty state. Celebrate consistency while allowing rest and missed weeks without punitive copy.

**Effort:** Medium in SVG; large with custom interactive Rive assets.

### 8. End each workout with a collectible completion card

**Where:** New post-workout summary; accessible again from history.

Create a compact card with the workout cover from idea 1, completion date, actual duration, completed sets, and one meaningful highlight. The segmented training line closes across the card. Add “View log” and an optional “Save image” action.

A truly new milestone can receive one brief celebration. Ordinary completions get a calm confirmation. This creates a satisfying finish and a distinctive artifact users can keep.

**Resources:** [Magic UI Number Ticker](https://magicui.design/docs/components/number-ticker) can inspire a short XP change; [Magic UI Confetti](https://magicui.design/docs/components/confetti) offers a celebration starting point. Use a custom static layout for image export.

**First prototype:** Normal completion, a new personal record, and partial completion. Display the confirmed saved result before any effect. Let users choose what appears in an exported image; sharing is an explicit action.

**Effort:** Medium. Image export is additional work beyond the summary UI and should be scoped separately.

### 9. Replace anonymous muscle bars with a training atlas

**Where:** Muscle coverage on Stats, optionally exercise detail.

Use a clean front/back body silhouette with clearly labeled muscle groups. Selecting a region reveals mapped sets in the selected period and contributing exercises. A text list remains visible beneath it, including unclassified activity.

This gives the atlas direction a literal, useful expression. It also makes the same colors meaningful on workout covers, exercise illustrations, and analytics.

**Resources:** Custom accessible SVG for the body; the [shadcn/ui Drawer](https://ui.shadcn.com/docs/components/drawer) pattern for region details. This does not require a 3D body engine. The principal work is illustration and consistent muscle mapping.

**First prototype:** Front/back toggle, selected region, no mapped activity, and 30% unclassified activity. Label the visualization “Logged muscle coverage.” It describes recorded activity, not fatigue, recovery, or injury risk.

**Effort:** Large if the current muscle taxonomy needs normalization; medium once mapping is reliable.

### 10. Offer a small set of expressive workout cover styles

**Where:** Workout naming/customization and occasional completion cards.

Let users choose among three coordinated covers: contour lines, layered color bands, and a fine dot field. Keep the exercise signature and typography consistent across them. A favorite workout becomes recognizable without requiring an uploaded photograph.

**Resource:** Explore [React Bits' Aurora](https://reactbits.dev/backgrounds/aurora) and its [component catalog](https://reactbits.dev/get-started/index) for visual inspiration. Prototype a static CSS/SVG interpretation first. A live background effect is an optional experiment, not a dependency for every workout card.

**First prototype:** Three static covers in light and dark themes. An optional preview may play a short effect after an explicit user action, then settle. Keep all text and controls outside low-contrast or moving detail.

**Effort:** Small–medium for static covers; larger for a live shader. Choose between personalized cover styles and more elaborate generative artwork after testing; they need not ship together.

## How to make borrowed components feel like PULSE

Use one token layer for color, typography, border radius, shadows, and spacing. Map imported source to those tokens immediately. Replace demo copy with real long exercise names, dates, units, empty states, and partial sessions.

Use the training-line motif in three places first: workout cover, timer, and completion card. Repetition across a real journey creates identity more effectively than a different effect on every screen.

Keep custom illustration style consistent: the same line weight, limited palette, simple shapes, and no mixing of unrelated stock icon packs. Build these into a small local component family, such as `WorkoutCover`, `PlanRoute`, `RestDial`, `AchievementStamp`, and `CompletionCard`.

### A focused 21st.dev selection process

1. Start with the verified Expandable reference above. Search for “workout card,” “timeline,” and “achievement card” as discovery terms, not assumed component names.
2. Compare at most three candidates for each purpose using PULSE's real content and a narrow mobile viewport.
3. Record the selected author, source URL, license, dependencies, and modifications in the implementation PR.
4. Borrow the useful interaction or composition; replace unrelated colors, decorative loops, demo data, and oversized desktop assumptions.
5. Implement one complete journey before selecting more components: dashboard → workout → rest → completion.

## Motion direction

The proposed timing below is a starting specification for prototypes, not a claim about the libraries' defaults.

| Interaction | Purpose | Proposed behavior | Reduced-motion / keyboard behavior |
| --- | --- | --- | --- |
| Pointer press on Start or Save | Confirm input | 100–140 ms subtle transform or color feedback; action starts immediately | Color feedback only; keyboard action is immediate |
| Exercise detail panel | Preserve location and context | 200–250 ms enter, 150 ms exit, ease-out; emerge from its trigger or screen edge | Instant open/close; retain focus management |
| Exercise reorder | Show placement | Follow the pointer directly; settle after release | Explicit move controls update immediately |
| Rest countdown | Communicate time | Stable digits; discrete progress changes; no perpetual breathing effect | Same readable countdown |
| Milestone earned | Brief delight | One optional 600–900 ms reveal after confirmed save | Static stamp and success text; no animated keyboard-triggered reveal |
| Theme selection | Apply preference | Immediate token switch | Immediate switch |

Use CSS transitions for simple feedback. Add Motion only when a selected interaction benefits from it, and centralize reduced-motion behavior using its [documented hook](https://motion.dev/docs/react-use-reduced-motion). Avoid animating layout dimensions, delaying actions, or replaying celebrations on every visit. Any optional visual loop must stop off-screen and have a static alternative.

## Stack fit and implementation boundaries

The current [web package](../../apps/web/package.json) declares Next.js 16, React 19, Tailwind CSS 4, Recharts 2, Lucide, and dnd-kit. It does not currently declare Motion or Rive. Existing local UI primitives should remain the foundation.

Copied examples may use different dependencies or component APIs. In particular, the selected 21st.dev example lists the older `framer-motion` import style and a measurement dependency. Evaluate one motion runtime for the project rather than accumulating overlapping packages. Current shadcn chart examples also need checking against the installed Recharts version.

Prefer the smallest implementation that proves the concept: local SVG covers, CSS feedback, existing charts, and existing reorder logic. Add custom artwork tooling or a richer runtime after testing a specific feature. Library installation alone does not supply accessible focus handling, correct data, or PULSE's design identity.

## Suggested first release

| Order | Concept | Why start here | Acceptance signal |
| --- | --- | --- | --- |
| 1 | Workout covers + completion card | One visual identity spans the start and end of a workout | Users distinguish saved workouts and understand what was completed |
| 2 | Rest-timer instrument | Puts the signature design into the most repeated training experience | Time and next action are readable at a glance; backgrounding preserves accuracy |
| 3 | Compact training route | Improves an existing ambiguous element | Users can identify the next workout and completed count without explanation |
| 4 | Exercise field guide | Makes discovery more visual while shortening the builder | Users add the intended exercise and return to their search without losing context |
| 5 | Progress stories and passport | Adds meaning to long-term use | Users can explain a result, inspect its source, and understand the next milestone |

Prototype the body atlas after resolving muscle classification. Treat live shader backgrounds and Rive as later experiments; the initial identity can be strong with static art.

## Prototype review checklist

- Show real short, long, duplicate, and unnamed workouts at 320–430 CSS px.
- Verify that Start, log entry, and Save remain immediately usable, including with the software keyboard open.
- Test long names, readable units, both themes, large text, touch, keyboard, and reduced motion.
- Compare the prototype with the current screen for wrong turns and comprehension, not only visual preference.
- Inspect bundle changes and responsiveness on a real phone; load decorative assets only where used.
- Keep the chart, unit, and overflow fixes from the UI/UX review as prerequisites for the affected screens.
- Select a creative direction by reviewing the whole workout journey, including failure, partial completion, and return visits.
