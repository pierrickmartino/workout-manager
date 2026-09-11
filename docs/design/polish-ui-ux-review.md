# PULSE — UI/UX review of polish.pen

Reviewed: 11 September 2026. Scope: all 12 screenshot panels in [polish.pen](polish.pen).

## Assessment

The interface has a coherent visual foundation: clear page titles, a recognizable teal primary action, restrained surfaces, consistent cards, and four persistent navigation destinations. The dashboard makes the next workout easy to identify. Search, favorites, exercise substitutions, and reusable workouts address practical training needs.

The next design pass should prioritize **trustworthy analytics, mobile layout containment, and shorter paths to frequent actions**. The most serious visible issue is the volume chart's inconsistent vertical scale. Other recurring problems are unclear measurement definitions, cramped record rows, competing workout terminology, and important controls placed after lengthy content.

Retain the overall visual identity. Improve information hierarchy and data presentation before adding decorative treatments.

## Method and limitations

I inspected the original JPG linked by every panel, including full-resolution inspection of the builder, analytics, strength analytics, and profile. This review concerns the light interface captured in these files. The screenshots differ from the dark interface assessed in the earlier source-code review; those earlier findings are not automatically findings about this board.

Pen.dev's live editor tools were not available in this session. The board was organized by editing its local JSON, and the screenshot assets were inspected directly. The resulting file has structural checks, but has not been opened or rendered through Pen.dev in this session.

These are full-page captures, not interactive prototypes. They establish visible layout and copy, but cannot establish actual tap areas, keyboard behavior, announcements, loading behavior, persistence, sticky positioning, or chart calculations. Screenshot pixels are not assumed to equal CSS pixels. Potential implementation causes are identified as hypotheses, not verified defects.

Priority definitions: **P1** = address first because it can mislead or obstruct a core task; **P2** = material usability improvement; **P3** = secondary polish. “Observed” identifies screenshot evidence; “Verify” identifies behavior or a cause requiring a running application.

## Board organization and screen inventory

The board now follows the bottom navigation: **Home → Train → Stats → Profile**, in four columns. Read each column from top to bottom. Each screenshot has a numbered caption and a matching layer name. Existing screenshot IDs, image references, dimensions, and image contents are preserved. Titles and captions are separate editable text nodes.

Columns start at x = 0, 1250, 2500, and 3750. Screens have 245 units between the end of one image and the start of the next, including its caption. Different screenshot widths are intentional: preserving them retains evidence of possible page overflow.

| Screen | Area | Screenshot | Board node / source location | Image origin (x, y) |
| --- | --- | --- | --- | --- |
| 01 Dashboard | Home | [IMG_6898.JPG](../img/IMG_6898.JPG) | `IskyF` · `polish.pen:66` | 0, 485 |
| 02 Training hub | Train | [IMG_6906.JPG](../img/IMG_6906.JPG) | `g0e635` · `polish.pen:105` | 1250, 485 |
| 03 My sessions | Train | [IMG_6902.JPG](../img/IMG_6902.JPG) | `M265c` · `polish.pen:132` | 1250, 4258 |
| 04 Session detail | Train | [IMG_6900.JPG](../img/IMG_6900.JPG) | `PegqK` · `polish.pen:159` | 1250, 9103 |
| 05 Workout builder | Train | [IMG_6904.JPG](../img/IMG_6904.JPG) | `P6vUV` · `polish.pen:186` | 1250, 14742 |
| 06 Exercise catalog | Train | [IMG_6908.JPG](../img/IMG_6908.JPG) | `FQp3v` · `polish.pen:213` | 1250, 18419 |
| 07 Analytics overview | Stats | [IMG_6910.JPG](../img/IMG_6910.JPG) | `IN28A` · `polish.pen:252` | 2500, 485 |
| 08 Strength analytics | Stats | [IMG_6912.JPG](../img/IMG_6912.JPG) | `g10VOK` · `polish.pen:279` | 2500, 7066 |
| 09 Metric history | Stats | [IMG_6914.JPG](../img/IMG_6914.JPG) | `lL0Lq` · `polish.pen:306` | 2500, 15647 |
| 10 Profile and settings | Profile | [IMG_6916.JPG](../img/IMG_6916.JPG) | `p7Vdw` · `polish.pen:345` | 3750, 485 |
| 11 Edit profile | Profile | [IMG_6920.JPG](../img/IMG_6920.JPG) | `aMpDT` · `polish.pen:372` | 3750, 6230 |
| 12 Admin | Profile | [IMG_6918.JPG](../img/IMG_6918.JPG) | `Z9ayNs` · `polish.pen:399` | 3750, 9855 |

Node IDs remain stable if subsequent edits change the line numbers.

## First fixes

| ID | Priority | Finding | Affected screens | Completion criterion |
| --- | --- | --- | --- | --- |
| UX-01 | P1 | Volume axis has inconsistent numeric ordering | 07 | Numeric values increase upward; plotted points match source values; units and aggregation are visible |
| UX-02 | P1 | Form content exceeds the apparent page shell | 05, 09 | No unintended horizontal page scrolling at 320, 375, 390, and 430 CSS px |
| UX-03 | P1 | Strength and record measurements lack sufficient meaning | 07, 08 | Each result states the metric, quantity/unit, and comparison basis |
| UX-04 | P2 | Records allocate too little width to exercise names | 07, 08 | Long names remain readable without narrow multi-line columns |
| UX-05 | P2 | Starting, saving, and settings access require unnecessary traversal | 02, 04, 05, 10 | Frequent actions remain easy to find without scrolling through unrelated detail |
| UX-06 | P2 | Small secondary text and pale data marks need validation | Most screens | Tested contrast and readable text at actual device size in supported themes |

## Screen-by-screen findings

### 01 — Dashboard

**Keep:** The next-session card contains a useful title, duration, exercise count, set count, and prominent start action. The secondary “View session” action supports reviewing before committing.

- **P2 · Observed — Progress counters use conflicting frames of reference.** The hero shows `1 / 32`, the queue shows `0 / 32`, and its first item is `00`. These may respectively mean next session, completed sessions, and a zero-based index, but none is explicit. Use “Next: session 1 of 32,” “0 of 32 completed,” and human-facing numbering starting at 1.
- **P2 · Observed — A second primary action changes the wording.** “Start session” above and “Start next” below the queue appear to address the same workout. Repetition can help on a long page, but use the same label and destination. Consider a persistent contextual start action once the hero leaves view.
- **P2 · Observed — The week strip depends on interpreting tiny dots.** Add readable week labels and a brief completion statement, such as “Week 1 of 8 · 0 of 4 sessions completed.” Treat individual dots as indicators unless there is room for usable controls.
- **P3 · Observed — XP has two unexplained totals.** `6,180 XP` and `2,580 / 2,800 XP` can be reconciled only if users know one is lifetime and one is within-level progress. Label the former “Total XP”; emphasize “220 XP to level 5.”

### 02 — Training hub

**Keep:** Recent workouts offer direct Start buttons and short exercise previews. The page supports both creation and reuse.

- **P2 · Observed — “Start new training” does not describe the whole page.** The page also repeats existing workouts and logs past activity. Use “Train,” then separate “Continue training” and “Create or log a workout.” For returning users, give the current plan or a recent workout precedence over creation.
- **P2 · Observed — Creation choices require understanding internal distinctions.** “Protocol,” “workout,” “session,” and “training” compete. Use “Generate a training plan” with “Multiple weeks,” “Generate a workout” with “One workout,” “Build a workout,” and “Log a completed workout.” This is a copy recommendation; retain any product-specific term only with an explanation.
- **P2 · Observed — Library and catalog access come after five recent-workout cards.** Place compact links near the page title or creation section. Show a shorter recent list with “See all workouts.”

### 03 — My sessions

**Keep:** Search and filters appear before the list; favorites have a recognizable star treatment.

- **P2 · Observed — Duplicate labels are difficult to distinguish.** Two “Calisthenics” entries and two “Aug 10, 2026” entries have similar summaries. Show a descriptive workout name and differentiating metadata, such as last performed date and a short exercise preview. Provide a clear rename path in the detail screen.
- **P2 · Observed — Card height is spent on repeated authorship.** “By Pierrick” is repeated for every captured row. De-emphasize ownership in a personal library; prioritize last performed date, duration, and equipment. A denser list would improve comparison.
- **P3 · Observed — “Trained 1×” is compressed and unnatural.** Prefer “Completed once” or “1 completion.” Keep date presentation consistent with the training hub.
- **Verify:** Favorite activation must not accidentally open the workout. Confirm separate accessible names and touch targets for the star and row link.

### 04 — Session detail

**Keep:** The prescription rows have consistent alignment and include load, rest, tempo, and muscles. Substitution is available for each exercise.

- **P2 · Observed — Start appears only after all five detailed exercise cards.** Add Start near the title and a summary of duration and set count. An optional bottom action can remain useful, provided it does not cover content or navigation.
- **P2 · Observed — Superset structure is not self-explanatory.** Consecutive exercises are marked “Superset A” and “Superset B,” while only one says “Round rest.” If these form a pair, visually group them under one round instruction: perform both exercises, then rest. If they belong to separate groups, show each group's membership explicitly.
- **P2 · Observed — Load prescriptions mix `% 1RM`, “Moderate,” and “Light.”** Preserve the target intent, but help users translate it into a loggable value or an explained effort target. Do not imply the app knows a working weight when it lacks the required input.
- **P3 · Observed — The generated title wraps the date awkwardly.** Prefer a descriptive workout name, with training type and date as metadata. Repeated AI-generated badges can move to a quieter provenance line or details section.

### 05 — Workout builder

- **P1 · Observed — Exercise cards and search results extend far beyond the header and save button's right edge.** The screenshot is 998 pixels wide while the header ends near x = 786. This is strong evidence of a layout-containment problem in the capture. **Verify** whether a minimum-width grid or long unbroken metadata forces overflow. Make fields stack at narrow widths and allow nested flex/grid children to shrink; do not solve this by clipping controls.
- **P2 · Observed — A push-up prescription presents “Weight (kg)” with a `60 kg` hint.** The faint hint may be a placeholder, not a saved value. Either way, it communicates a poor default for a bodyweight movement. Offer explicit “Bodyweight,” “Added weight,” and “Assistance” concepts where applicable, with a unit outside the numeric entry.
- **P2 · Observed — Search-result creation competes with existing matches.** “Create ‘Push’” comes before multiple relevant push-up results. Put matching exercises first and make creation a clearly secondary “Create a custom exercise” action. Similar names such as “Cable Tricep Pushdown” and “Triceps Cable Pushdown” also warrant a catalog duplicate review.
- **P2 · Observed — Naming and save context are weak.** No workout-name field is visible; “Save reusable session” comes after the exercise library. Add a name near the top, shorten the introduction, and keep a save summary available with the exercise count. Verify draft recovery and undo after removing an exercise.

### 06 — Exercise catalog

**Keep:** Search, muscle, difficulty, and equipment filters are available. “Load more (87 more)” clearly communicates that the list is partial.

- **P2 · Observed — Equipment vocabulary contains apparent duplicates.** “barbell” and “barbells,” singular/plural variants, and inconsistent capitalization make filtering unpredictable. Normalize display names and map aliases to a canonical option. Preserve a specific machine model only when it changes exercise compatibility.
- **P2 · Observed — Filter controls occupy a large section before results.** Keep search prominent and collapse secondary filters behind a labeled control showing the selected count. Include active filter chips and a clear reset action when filters are selected.
- **P2 · Observed — Long exercise names truncate while secondary badges retain space.** Let names wrap to two lines; keep provenance and training history below. “NEW” should state whether it means new to the catalog or never performed by this user.
- **P3 · Observed — Anatomy strings are more detailed than the discovery task requires.** Use a short plain-language muscle summary in results, with complete anatomy in exercise detail.
- **Verify:** Preserve search/filter state when returning from an exercise, and make loaded-result counts and no-match recovery understandable.

### 07 — Analytics overview

- **P1 · Observed — Total Volume has a non-monotonic vertical scale.** The tick labels read `8000`, `8500`, `9000`, `9500`, then `0` from top to bottom. A continuous quantitative axis cannot be interpreted reliably in this order. Check numeric parsing, axis domain, and tick formatting against known data. No particular implementation cause is established by the screenshot.
- **P1 · Observed — Chart titles omit measurement units and aggregation.** “Total Volume” does not say kg·reps, lb·reps, or another definition; “Weekly Distance” lacks km/mi. Explain what each point represents and what “From 97% of your logged volume” includes or excludes.
- **P2 · Observed — Time windows differ within the page.** The selected filter is 30D, while muscle coverage says “Last 8 weeks.” That exception is labeled, but easy to overlook. Apply a common range where meaningful or place the fixed range directly beside its metric title. Prefer “Last 30 days” to unexplained abbreviations when space allows.
- **P2 · Observed — Muscle coverage sounds more certain than the data supports.** The split has 30% unclassified data, yet shoulders are labeled “Not trained.” This does not establish a calculation bug, but the wording overstates certainty. Use “No mapped shoulder sets” and show the classification limitation alongside the result. Explain how percentages are computed.
- **P2 · Observed — Record values crowd exercise names.** Names wrap into narrow columns while “bodyweight × 10” occupies a large fixed-looking area. Use a full-width name row, followed by result and date. Show a short preview of records and move history/metric navigation nearer the top.

### 08 — Strength analytics

- **P1 · Observed — `111 kg` and `97 kg` do not identify the strength metric.** A user cannot tell whether this is added load, total moved load, or an estimated maximum. Label the actual metric and its basis. If it is an estimate, name it as an estimate and make the calculation explanation available.
- **P1 · Observed — Personal-record units are ambiguous.** “Handstand hold — bodyweight × 8” does not say whether 8 is seconds or repetitions. Other records show a `+3 kg` or `+6 kg` annotation alongside a main bodyweight result. Clarify whether the annotation is added load or improvement over the previous record. Render duration, reps, distance, and load according to their actual measurement type.
- **P2 · Observed — Bar charts use elevated baselines.** Several bar axes start near 87–101 kg instead of zero. This exaggerates apparent proportional changes. Prefer a line or dot chart for a focused range, with the range explicit; use a zero baseline for magnitude-comparison bars.
- **P2 · Observed — Muscle-balance colors are not unique.** Legs and arms share similar teal, while chest and core share purple. The normalized stacks are hard to decode. Provide a readable numeric breakdown per week and direct category identification; do not rely on hue alone.
- **P2 · Observed — Six charts and 20 record rows form an exceptionally long screen.** Add an exercise selector or compact comparison summary. Separate record history from trajectories with accessible, state-preserving navigation. Keep the latest result visible without requiring users to scan every chart.

### 09 — Metric history

- **P1 · Observed — The date control extends beyond the other fields' right boundary.** The capture is 806 pixels wide and the date field reaches the image edge; the regular header/content shell is narrower. Verify native date-input sizing at narrow widths and constrain the control to its container.
- **P2 · Observed — Unit is optional for a weight reading.** Offer a standard unit based on the user's preference; store a unit with every comparable reading. If custom metrics remain available, distinguish them from common metrics with known units.
- **P2 · Observed — Profile weight and historical weight have separate meanings that require explanatory prose.** Offer a clear policy or explicit option to update profile weight from a new reading. The UI should make it easy to understand why a recent historical reading and profile weight differ.
- **P3 · Observed — Dates switch between “11 Sep 2026” and ISO strings.** Use a consistent localized display for history. Add a small trend or change summary once enough comparable readings exist.
- **Verify:** Editing/deleting an incorrect reading, invalid numeric input, successful recording, and failed-save recovery are not shown.

### 10 — Profile and settings

**Keep:** Theme and weight-unit controls make preference choices explicit. Earned achievements include dates and unfinished goals show progress.

- **P2 · Observed — Settings and profile editing are below extensive progress content.** Move “Edit profile” beside the profile heading and group appearance/units under an immediately discoverable Settings destination. Keep a concise progress summary, linking to the full achievement view.
- **P2 · Observed — The heatmap has no visible date anchors and its right edge is clipped.** Visible cells appear uniformly pale despite the surrounding activity totals. This may be an off-screen date range, not missing records. Add month/week context, position recent activity intentionally, and expose a selected date plus count. Replace “Hover or focus a day” with touch-compatible instructions and behavior.
- **P2 · Observed — Weight unit and screen-awake behavior are grouped under Appearance.** Separate “Appearance” from “Workout preferences” to improve findability.
- **P3 · Observed — Empty profile values are only dashes.** Where helpful, use “Not set” and a nearby edit affordance. Label lifetime XP separately from current-level XP as on the dashboard.

### 11 — Edit profile

- **P2 · Observed — Equipment is a long single-line string.** Its captured value is cut off. Replace comma-separated text with a searchable multi-select and removable choices, using the same vocabulary as the catalog.
- **P2 · Observed — Rest-timer guidance is clipped inside the placeholder.** Move the default behavior below the input, where it remains visible after typing. Use a short example such as “90” inside the control and keep “seconds” in the label.
- **P2 · Observed — Five 1–10 fitness ratings lack calibration.** Define what low, middle, and high ratings mean, or use understandable experience categories with optional detail. Otherwise different users will supply incomparable values.
- **P2 · Observed — The exit link says “Back to dashboard.”** The adjacent profile screen offers entry to this editor. Prefer “Back to profile” or a return destination based on the entry path. Verify save confirmation and unsaved-change recovery.
- **P2 · Observed — Constraint labels describe system behavior more than user intent.** Briefly explain how the choices affect workout generation and which fields are optional. Keep this explanation beside the controls rather than requiring users to infer “extra caution.”

### 12 — Admin

- **P2 · Observed — The catalog-health bar has an ambiguous meaning.** The headline says 0% enriched, but roughly 29% of the bar is filled, corresponding to the Listable percentage. Label it as a readiness breakdown with a legend, or make an enrichment-progress bar track enrichment alone.
- **P2 · Observed — Skin selection mixes “Published” and “Active” without scope.** State whether changing the skin affects this account, a preview, or all users. If it is global, provide an explicit apply action and clear outcome. Do not imply instant global changes unless that is the actual behavior.
- **P2 · Observed — “Run backfill” asks for action without a visible execution estimate.** Admins can benefit from technical details, but the decision should state what will be processed, whether existing information changes, and any known cost/usage estimate. After starting, provide progress, failures, and a safe retry path. The running and failed states are absent from the board.
- **P3 · Observed — No bottom-navigation destination appears selected.** Keep Profile active for this subordinate screen and retain “Back to profile.”

## Shared visual and interaction direction

### Information hierarchy

Adopt a small vocabulary: **training plan** for a multi-week schedule, **workout** for a reusable prescription, and **completed workout** for a logged performance. Use this consistently in page names and actions. Keep the tactical brand treatment in small section markers; use ordinary language for instructions and decisions.

Use proportional body text for multi-line explanations. Monospace works well for short labels and numeric data but makes the introductory paragraphs and anatomy lists harder to scan. Shorten explanations before reducing type size.

Use the same record-row pattern everywhere: exercise name first, result second, then date and comparison. Give titles priority over repeated AI/curated badges. Preserve meaningful provenance in details.

### Action hierarchy

Make the next action obvious at the top of task pages: Start on session detail, Save in the builder, Edit on profile. Contextual sticky controls are a candidate, not a verified requirement; test their behavior alongside the bottom navigation and the software keyboard.

Provide undo for reversible editing actions and visible recovery after failures. Design pending, success, and error states with the same care as the resting screen. These behaviors are not assessable from the captures. The [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) provide the implementation checklist for focus, form feedback, reduced motion, stateful navigation, and safe-area handling.

### Accessibility validation

The light palette's pale bars, small metadata, chip text, and muted controls need measurement in the rendered application. This review makes no numeric contrast or WCAG failure claim from the compressed screenshots. For ordinary text, validate at least 4.5:1; large text has a 3:1 threshold under the applicable definition. See [WCAG contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

Use roughly 44×44 CSS px as the product's preferred touch target for important controls, especially during workouts. WCAG 2.2 AA specifies 24×24 CSS px with defined exceptions, including spacing; actual hit boxes must be checked rather than inferred from icon size. See [WCAG target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Validate keyboard navigation and visible focus for tabs, chips, favorites, reorder controls, charts, and theme choices. Check selected/disabled states without relying solely on color. Provide a readable data alternative for charts and touch access to any tooltip information. Verify screen-reader names, form associations, and result announcements against the DOM; they cannot be reviewed from this board.

## Missing states and journeys to add to the board

Absence here means **not represented in the supplied captures**, not absent from the product.

| Journey | States needed for a complete interaction review |
| --- | --- |
| First workout | New account, incomplete profile, no plan, no saved workouts |
| Generate training | Configuration, pending generation, completed result, failed generation, retry, existing-plan replacement |
| Perform a workout | Active set, rest timer, skip, correction, resume, partial finish, completed summary |
| Build a workout | Empty builder, exercise added, custom exercise, reorder/remove undo, validation, saved draft, failed save |
| Browse | Selected filters, no matches, loading more, exercise detail, return with search preserved |
| Track progress | No readings, one point, missing units, unclassified data, chart selection, record detail |
| Change settings | Unsaved edits, save success/failure, unit change, dark/system theme |
| Admin | Preview/apply scope, enrichment running, partial failure, completion |
| Mobile resilience | Open keyboard, narrow viewport, larger text, safe-area devices, offline/interrupted connection |

## Recommended sequence and acceptance checks

1. **Restore data clarity.** Fix the volume axis, label every metric/unit, and disambiguate records. Validate with a small known dataset: increasing values, a decreasing value, zero, missing data, a timed hold, and a weighted/bodyweight exercise. Confirm the chart and record text tell the same story.
2. **Fix containment and record layouts.** Reproduce the builder and metric-field overflow at 320–430 CSS px. Check long exercise/equipment names and 200% text zoom. Controls must remain reachable without unintended horizontal page scrolling.
3. **Simplify frequent tasks.** Standardize workout terminology, elevate Start/Save/Edit, shorten repeated lists, and improve the return path from profile editing. Ask a few representative users to start today's workout, repeat a saved workout, build a push-up workout, record a weight reading, and find their latest pull-up result. Record wrong turns and places where users ask what a number means.
4. **Complete interaction coverage.** Add the missing states above and test keyboard, touch, screen reader, both themes, and interrupted saves. Require recoverable errors and preserved user input before treating the workflows as ready.

## Deliverable validation

The board edit is organizational: the 12 original image panels retain their IDs, dimensions, image fills, and asset paths. It adds four navigation-area headings, 12 numbered captions, a board title, and two guide lines. JSON parsing, unique IDs, existing image references, image-panel preservation, and non-overlapping panel bounds were checked. Native Pen.dev rendering remains unverified because its tools were unavailable in this session.
