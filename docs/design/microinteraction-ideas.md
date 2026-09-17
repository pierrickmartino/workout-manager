# PULSE — Microinteraction ideas

Prepared: 17 September 2026.

Proposal grounded in the existing live-session controls, workout sigils, training route, builder, analytics, and sync states. These are design ideas, not implemented behavior. Builds on the [creative directions](pulse-creative-directions.md).

Prompt : Create a new markdown file with ideas to⠁add micro interactions to the application UX in order to give it a unique design.

## Design direction: make effort leave a mark

Give PULSE a recognizable interaction language through three recurring gestures: **press**, **connect**, and **stamp**. Controls respond with a small press; training progress connects a route; completed work earns a quiet stamp. Reuse the existing training-type accents and geometric workout sigil so the personality belongs to this application.

Keep frequent interactions almost instantaneous. Give occasional achievements more expression. Motion should confirm an action, preserve the user's place, or explain a change.

## Ideas for the core training flow

### 1. A tactile set-completion check

- **Trigger:** The user taps the control to complete a valid set.
- **Response:** Compress only the control to `scale(0.97)`, then settle over 120ms. Crossfade its icon to a check and softly tint the completed row. Keep entered reps and load readable.
- **Signature detail:** A small accent segment beside the row becomes solid, like another mark entered into a training journal.
- **Benefit:** A clear acknowledgement when attention is divided between the phone and exercise.
- **Constraint:** Apply completion immediately; animation never gates the next set. Invalid input keeps its values and shows a field-level explanation without a shake. Skipped sets use a distinct icon and label.
- **Starting point:** [live-session-sets.tsx](../../apps/web/components/live-session-sets.tsx).

### 2. A calm handoff to the next exercise

- **Trigger:** Completing the last set of an exercise advances the current unit.
- **Response:** Crossfade the completed unit into its compact summary over 140ms. Transfer the accent marker to the next unit over 180ms while retaining the summary as an anchor.
- **Signature detail:** The same small progress marker guides the workout from start to finish.
- **Benefit:** Explains where the user is after the existing automatic collapse.
- **Constraint:** Do not animate card height or unexpectedly scroll away from an edited field. Preserve focus when the completed control is removed. Reopening a summary should remain immediate and reversible.
- **Starting point:** [live-session-sets.tsx](../../apps/web/components/live-session-sets.tsx).

### 3. A rest timer with one clear arrival cue

- **Trigger:** Rest starts or the remaining time reaches zero.
- **Response:** Show stable, tabular numerals throughout the countdown. At zero, give the timer outline one 200ms opacity pulse and show “Rest complete.”
- **Signature detail:** Use the same segmented visual language as workout progress, with an explicit “Rest” label if a progress track is added.
- **Benefit:** Makes the transition back to exercise easy to notice without constantly demanding attention.
- **Constraint:** No bouncing digits, flashing final seconds, or repeating pulse. Derive time from the timer state, never animation completion. Returning from the background immediately shows the actual remaining time. Announce completion once, not every second.

### 4. A workout signature stamp

- **Trigger:** Finishing a workout successfully saves its record, either locally or remotely.
- **Response:** Settle the existing sigil from `scale(0.96)` to `scale(1)` over 240ms and fade in a fine frame, like a stamp on a completed page.
- **Signature detail:** Preserve the session's existing deterministic geometry; the same workout remains recognizable in history.
- **Benefit:** Gives the end of a workout an identifiable PULSE moment.
- **Constraint:** Show the true save status alongside the stamp: “Saved on this device” while queued, “Synced” only after acknowledgement. Do not replay when background sync completes or when history is reopened. Sigil nodes are decorative and clamped, so never use them as an exact completed-set count.
- **Starting points:** [workout-sigil.tsx](../../apps/web/components/pulse/workout-sigil.tsx), [SyncStatusBanner.tsx](../../apps/web/components/SyncStatusBanner.tsx).

## Ideas across the application

| Idea | Trigger and response | Why it belongs to PULSE | Guardrail / starting point |
| --- | --- | --- | --- |
| **Training route connection** | After confirmed protocol progress, fade in the newly completed connector and move the current-session marker over 220ms. | Makes each workout feel like a step along a personal route. | Base it on actual protocol progress; keep completed and next-session labels. Do not imply a scheduled calendar. Start with `pulse/training-route.tsx`. |
| **Builder placement feedback** | During pointer reorder, the exercise follows the pointer directly; on release, settle into its slot over 180ms and briefly tint the destination. | Feels like arranging the pieces of a workout. | Extend the existing sortable behavior. Keep drag on its handle so touch scrolling works; keyboard reorder is immediate and announced. Start with `builder/session-composition-strip.tsx`. |
| **Superset connection** | After grouping exercises, fade in the shared bracket over 160ms and reveal the round-rest label in place. | Visually connects exercises that belong to one round. | Keep the explicit “Superset” label and member letters; ungrouping updates immediately. Never imply that proximity alone creates a superset. Start with the builder's existing bracket. |
| **Muscle atlas selection** | Selecting a muscle fades its emphasis in over 160ms while showing the associated details. | Turns the body illustration into a responsive map of training. | Selection must work by touch and keyboard, with names and values in text. Do not present training activity as measured recovery or medical readiness. Start with `analytics/muscle-atlas.tsx`. |
| **Heatmap day inspection** | Tapping a day opens a small detail surface from that cell with a 140ms fade and 4px translation. | Gives the training journal a precise, explorable feel. | Provide focus and tap equivalents for hover; no animation on keyboard navigation. Use recorded daily activity, without inventing missed-workout judgments. Start with `pulse/training-heatmap.tsx`. |
| **Favorite confirmation** | After a successful toggle, fill the favorite icon and settle from `scale(0.94)` over 120ms. | A small personal mark on a workout worth returning to. | Update the accessible pressed state, preserve focus, and show failure if persistence fails. Avoid particle bursts. Start with `FavoriteSessionControl.tsx`. |
| **Contextual menu emergence** | Open overflow menus with a 160ms fade and subtle scale from the trigger; close in 100ms. | Makes the interface feel physically connected and consistent. | Preserve focus management and Escape behavior; repeated toggles retarget smoothly. Start with `pulse/overflow-menu.tsx`. |
| **Generation resolves into a signature** | When generation actually returns a saved session, fade the result's workout mark into the pending panel over 220ms. | Introduces the new workout through its own visual identity. | No fabricated progress percentages or claimed AI stages. Keep pending, failure, and retry states explicit; respect reduced motion in any loading indicator. Start with `GenerateSessionForm.tsx`. |
| **Quiet sync acknowledgement** | Crossfade the banner icon over 140ms when the real sync state changes. | Reinforces that a training record is safely moving from device to account. | Preserve all five existing states and the readable confirmation duration. Do not dismiss a failure through animation. Start with `SyncStatusBanner.tsx`. |
| **An earned achievement stamp** | When a newly earned achievement is confirmed during the completion flow, settle its badge over 280ms and show its name and earned date. | Extends the workout stamp into a collection of meaningful milestones. | Celebrate only a newly observed unlock, once; existing badges stay still on page load. Avoid a second competing celebration if the workout stamp is already playing. Start with `pulse/achievement-wall.tsx`. |

Component paths in the table are relative to `apps/web/components/`.

## Shared interaction rules

- **Timing:** 100–160ms for frequent feedback; 160–240ms for contextual transitions; up to 280ms for an earned stamp. Keep exits shorter than entrances.
- **Easing:** Use `cubic-bezier(0.22, 1, 0.36, 1)` for settling and entry; `cubic-bezier(0.25, 1, 0.5, 1)` for movement. Follow the pointer without easing during drag.
- **Implementation:** Prefer interruptible CSS transitions. Animate transform and opacity; restrained color transitions can communicate state. Avoid animated layout dimensions, `transition: all`, and permanent `will-change`. Reuse existing components before adding animation dependencies.
- **Reduced motion:** Under `prefers-reduced-motion: reduce`, remove spatial movement, stamping, pulses, and loading rotation. Show the final state and readable status immediately. Information must never depend on movement.
- **Keyboard:** Keep keyboard-triggered interactions immediate, with visible focus and the same state feedback. Do not delay navigation, validation, or announcements for an effect.
- **Touch:** Use comfortable hit areas and explicit controls. Hover embellishments apply only to fine pointers with hover support; essential information is always available by tap or focus.
- **Interruptibility:** Rapid repeat actions should settle toward the latest state. Prevent duplicate submissions through action state, not an animation lock. Feedback must reflect actual persistence and validation results.
- **Restraint:** No page-load choreography, decorative infinite loops, animated numeric totals on every visit, or routine confetti. Theme switches should update immediately without sweeping color transitions.

## Suggested first implementation

1. **Set completion and exercise handoff:** Highest daily value; verify that repeated logging stays fast and focus survives collapse.
2. **Workout signature stamp and sync feedback:** Establish the distinctive end-of-workout moment while keeping local save and server sync clear.
3. **Builder placement and superset connection:** Polish existing editing interactions without introducing new gestures.
4. **Route, atlas, heatmap, and achievements:** Extend the same language after validating the training flow.

Before shipping each interaction, try rapid repeated input, keyboard-only use, reduced motion, narrow touch screens, and relevant offline/failure states. Check that motion causes no accidental actions, focus loss, unreadable feedback, or added wait before continuing. For the timer, also test returning from the background. For achievements and completion, confirm that revisiting a page does not replay the celebration.

The first prototype should demonstrate one full sequence: **complete a set → find the next exercise → finish the workout → see its signature and accurate save status**.
