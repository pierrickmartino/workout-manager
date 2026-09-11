# PULSE — Ideas for additional skins

Prepared: 11 September 2026. Based on the current [globals.css](../../apps/web/app/globals.css), [root layout](../../apps/web/app/layout.tsx), and shared button, card, input, and alert components.

## What is implemented in this checkout

The stylesheet is named `globals.css`. It defines one dark PULSE appearance through Tailwind's `@theme` tokens:

| Layer | Current implementation | Implication for new skins |
| --- | --- | --- |
| Surfaces | Base `#09090b`, surface `#18181b`, elevated `#27272a` | Three useful surface levels already exist |
| Text | Primary `#fafafa`, secondary `#a1a1aa`, muted `#71717a` | Each skin needs a coordinated set of text colors, not just a new accent |
| Accents | Cyan `#29e7e0`, blue `#4c8dff`, violet `#9a6bff`, magenta `#ff4d9d` | Accent names describe colors, while components use them for different semantic roles |
| Accent surfaces | Cyan, violet, and magenta translucent variants; dark `on-accent` text | Tinted backgrounds and button foregrounds need to change together |
| Typography | Space Grotesk for body/display; JetBrains Mono for labels/data | Both are loaded through `next/font` in the root layout |
| Shape | Radii of 6, 8, 10, and 14 px | A skin can change panel and control character through existing radius tokens |
| Layout | `--spacing-shell: 26rem` | Keep responsive structure consistent across skins |
| Labels | `.label-mono` enforces monospace, uppercase, and `0.08em` tracking | An editorial or softer skin needs control over this treatment |
| Controls | Buttons and inputs also specify monospace/uppercase styles directly | Changing only `.label-mono` will not restyle every label or action |
| Native appearance | `color-scheme: dark` on HTML and form controls | Light skins require changing both rules |
| Browser chrome | `themeColor: #09090b` in the root layout | Browser chrome needs to follow the resolved appearance |
| Motion | A `pulse-sweep` generation animation | Motion is not currently a configurable skin dimension |

There are no skin selectors or light/system mode selectors in this stylesheet. I also found no Aurora/Vercel skin implementation in the inspected web source. The [polish screenshots](polish.pen) show those names and appearance controls; they document a different state from this checkout. The ideas below are additions, and do not assume that the screenshot selector is available in the current code.

## Recommended collection

Keep **PULSE** as the original tactical identity. Add **Alpine**, **Clay**, and **Track** first: they provide three clearly different moods while retaining readable forms and data. Explore the other four once the shared skin infrastructure works.

A skin should define color, surface treatment, typography hierarchy, and graphic details. Light/dark is a separate appearance preference. The same selected skin should remain recognizable in both modes.

| Skin | Character | Signature detail | Best use | Implementation scope |
| --- | --- | --- | --- | --- |
| **Alpine** | Outdoor, clear, grounded | Contour-line header and route markers | Everyday training and mixed activities | Existing tokens plus optional SVG artwork |
| **Clay** | Warm, tactile, welcoming | Rounded inset panels and restrained ceramic tones | General fitness and a softer daily experience | Tokens plus label and surface hooks |
| **Track** | Athletic, bold, precise | Lane numbers and a strong finish-line rule | Live workouts and repeat sessions | Tokens plus numeral and graphic treatment |
| Blueprint | Technical, structured | Fine drafting grid and annotated corners | Workout building and detailed prescriptions | Tokens plus controlled background patterns |
| Nocturne | Quiet, polished, spacious | Deep ink surfaces with thin iris accents | Evening use and focused tracking | Mostly tokens; subtle surface styling |
| Mono Print | Editorial, deliberate | Ink rules and strong typographic hierarchy | History and analytics | Tokens plus typography-role hooks |
| Arcade | Playful, collectible | Original pixel stamps and stepped frames | Achievements and personal expression | Most custom artwork; selected component treatments |

Scope is relative design/implementation effort, not a delivery estimate.

## Palette sketches

These are starting colors for mockups, not approved accessibility palettes. Secondary text, borders, chart colors, disabled controls, focus rings, and tinted states still need complete specifications and contrast validation.

| Skin | Light: base / surface / text / accent | Dark: base / surface / text / accent |
| --- | --- | --- |
| Alpine | `#F2F5EF` / `#FFFFFF` / `#172A24` / `#236547` | `#101B17` / `#1B2B23` / `#EDF4EF` / `#8BD6AA` |
| Clay | `#F8F1E9` / `#FFFCF7` / `#382921` / `#98462E` | `#211B18` / `#302621` / `#F8EDE3` / `#EBA88B` |
| Track | `#F3F5F8` / `#FFFFFF` / `#111C32` / `#234ED8` | `#101520` / `#1B2435` / `#F4F6FC` / `#A9BEFF` |
| Blueprint | `#EFF4FC` / `#FFFFFF` / `#162A48` / `#2457A6` | `#0D1B30` / `#152B47` / `#EDF4FF` / `#88C5FF` |
| Nocturne | `#F4F2F8` / `#FFFFFF` / `#282236` / `#66508E` | `#16131D` / `#231E2E` / `#F4EEF9` / `#C7AFF0` |
| Mono Print | `#F6F4ED` / `#FFFEF9` / `#20201D` / `#34342F` | `#181918` / `#242624` / `#F3F2EA` / `#E7E5D9` |
| Arcade | `#F5F1FF` / `#FFFFFF` / `#292044` / `#6940B8` | `#171127` / `#271D3C` / `#F7F0FF` / `#D3A7FF` |

For a filled primary button, use a light foreground with the darker light-mode accent and a dark foreground with the lighter dark-mode accent, subject to measurement. Do not inherit the existing dark `on-accent` value unchanged for every skin.

## 1. Alpine

**Idea:** A training companion with the clarity of a well-designed trail map. Forest tones, pale stone surfaces, and numbered route markers give PULSE an outdoors character without turning every workout into hiking.

**Distinctive treatment:** Place a quiet contour-line illustration in the upper part of the session hero. Use the segmented training route from the [creative directions](pulse-creative-directions.md) for week progress. Restrict the pattern to nonessential artwork areas so it does not interfere with prescriptions or charts.

**Across the app:**

- Home: next workout on a stone-colored panel, with a small route marker and a clear Start button.
- Live session: a simple forest-green timer ring and large, stable numerals.
- Stats: thin lines, readable labels, and a distinct categorical palette inspired by moss, lake blue, ochre, and plum.
- Profile: achievement stamps resembling small trail markers, with explicit dates and titles.

**Typography and shape:** Retain Space Grotesk and JetBrains Mono initially. Use medium rounded cards and pill-like metadata where it improves grouping. Reserve uppercase for short navigation and section markers.

**Implementation fit:** High. Most of the character comes from the existing color/radius tokens and one reusable decorative SVG. Keep maps and elevation motifs abstract unless the app has real geographic data.

**First mockup:** Dashboard and live rest timer in both modes. The skin should remain recognizable with the contour artwork hidden.

## 2. Clay

**Idea:** Warm ceramic, chalk, and terracotta. A more welcoming expression for users who prefer a personal fitness journal to a technical dashboard.

**Distinctive treatment:** Use softly rounded panels, warm neutral borders, and a shallow inset area for supporting information. Avoid adding texture inside controls. A tiny stamped-circle motif can connect progress and achievements.

**Across the app:**

- Home: warm cream background, a simple terracotta action, and generous separation between the next workout and secondary information.
- Builder: clear grouped fields with warm borders; readable body-font labels and visible units.
- Stats: flat, precise charts on clean surfaces; the warmth belongs to the frame around the data.
- Profile: an orderly collection of small illustrated stamps and concise progress text.

**Typography and shape:** Use the current body font for the first pass. Keep monospace for numerical comparisons, while labels and buttons use sentence case and the body font. Increase card radii moderately, preserving the same control heights.

**Implementation fit:** Medium. Needs configurable label/action typography and optional inset-surface styling. A terracotta brand accent must remain visually distinct from destructive/error feedback.

**First mockup:** Edit profile and workout builder, using long equipment values and visible validation errors. These utilitarian screens are the best test of whether the skin is genuinely coherent.

## 3. Track

**Idea:** The graphics of an athletics meet: strong numbers, lane markings, cobalt blue, and a small amount of warm yellow.

**Distinctive treatment:** A two-line finish marker becomes the signature divider on workout cards and completion summaries. Exercise numbers sit in strong rectangular markers. Use yellow only for a selected highlight or achievement detail, with dark readable text.

**Across the app:**

- Home: compact next-session card with a bold workout title and clearly separated duration/set counts.
- Live session: oversized time and set numerals; a stable horizontal progress rail beneath them.
- Builder: ordered exercises read as numbered stages, with a clear bracket around supersets.
- Completion: a memorable result card showing actual work completed, using the finish marker as its graphic signature.

**Typography and shape:** Keep the existing fonts for a fast prototype, increasing display weight and making numeric hierarchy stronger. A condensed display face is a later option and would require adding a font asset. Prefer smaller radii and firm borders.

**Implementation fit:** Medium. Colors and radii fit existing tokens; stage markers and numeral styles need shared component hooks. Preserve comfortable text sizes and touch targets even when the visual treatment is compact.

**First mockup:** Session detail → active set → rest → completion. This skin should feel energetic while the interface itself stays stable.

## 4. Blueprint

**Idea:** A precise planning surface with navy, drafting blue, fine grids, and short annotations. It differs from original PULSE through its diagram-like construction rather than bright neon on near-black surfaces.

**Distinctive treatment:** Use a faint drafting grid behind a hero illustration and small corner marks around plan summaries. Supersets use visible connection brackets. Show configuration as readable specifications.

**Across the app:** The builder gets the strongest expression; exercise order and grouping become visually explicit. The rest timer resembles a simple instrument dial. Analytics retain plain numeric axes and do not reuse decorative grids as data grids.

**Typography and shape:** The existing Space Grotesk/JetBrains Mono pair is well suited. Use small radii, consistent thin rules, and uppercase only for brief annotations.

**Implementation fit:** High–medium. A CSS/SVG pattern and a few ornamental edges complement existing tokens. Decorative pattern contrast should stay subordinate to real field boundaries and focus indicators.

**First mockup:** Builder with one superset and a long exercise name, plus Analytics to confirm that decoration cannot be mistaken for chart information.

## 5. Nocturne

**Idea:** A quiet ink-and-iris interface with clear hierarchy and restrained highlights. This is a complete skin with a related light variant, rather than another name for dark mode.

**Distinctive treatment:** Tonal layers do most of the work: plum-tinted dark surfaces, soft ivory text, and a single fine accent rule. Give meaningful values more space while keeping decorative effects minimal.

**Across the app:** Home emphasizes the next workout without an animated background. The timer uses crisp digits. Stats use clear line weights and accessible colors. Profile milestones are small engraved-style illustrations rather than bright badges.

**Typography and shape:** Retain current fonts and medium radii. Reduce the visual prominence of secondary metadata through hierarchy and spacing, not by making it unreadably faint.

**Implementation fit:** High. This is the best candidate for proving that a skin can be effective primarily through tokens. Distinguish it from a possible Aurora skin with restrained solid surfaces and no luminous gradient treatment.

**First mockup:** Dashboard and Strength analytics. Compare secondary-text clarity and active-control visibility with original PULSE.

## 6. Mono Print

**Idea:** An editorial training record: warm paper, strong ink, deliberate rules, and well-composed tables. Its character comes from typography and structure.

**Distinctive treatment:** Use a strong headline, a short summary, and numbered records. Workout completion resembles a small printed training report, with a date and one meaningful result.

**Across the app:** Analytics gets a readable headline and supporting chart. History uses full-width exercise names and clean numerical alignment. Profile achievements look like dated print marks. Start and Save remain solid, prominent controls.

**Typography and shape:** Keep Space Grotesk for functional text. An optional serif display font could be introduced for page titles after checking long-title behavior; it is not currently loaded. Use small radii and expressive border weights, with restrained uppercase.

**Implementation fit:** Medium. Requires label/display role control and border-weight hooks. The interface can be mostly monochrome while charts retain enough labeled, distinct encodings to remain interpretable.

**First mockup:** Analytics, Metric history, and a completion card. Keep paper texture away from tables and small text. This differs from the screenshot's minimal Vercel concept through warmer surfaces and editorial composition.

## 7. Arcade

**Idea:** A contemporary fitness interface with original pixel-art collectibles and stepped graphic details. Keep the underlying forms and navigation easy to use.

**Distinctive treatment:** Achievement stamps become a small collection of original pixel illustrations. A stepped progress rail connects workout completion and level progress. Reserve the strongest pixel treatment for the reward area and workout covers.

**Across the app:** Home uses a small collectible emblem beside the next workout. The live timer keeps the normal readable numerals. Profile gets the richest illustration treatment. Stats remain conventional charts, with labels and clear units.

**Typography and shape:** Retain readable body fonts. A pixel face, if added, is limited to short decorative headings and never used for prescriptions, form fields, or chart labels. Use selected stepped frames rather than turning every element into a pixel box.

**Implementation fit:** Large relative to the other options. Requires a cohesive original artwork set and component decoration hooks. No new animation runtime is required for the static version.

**First mockup:** Profile with four achievements, a locked milestone, and one completion card. Validate whether the skin still feels useful and mature when there is no reward to display.

## Shared skin architecture to plan for

This is a design proposal, not a ready-to-paste CSS implementation. A future implementation should retain the current layout and component behavior while introducing a controlled appearance layer.

### Separate identity, mode, and preferences

Represent skin identity independently from light/dark/system preference. For example, an implementation could use `data-skin="alpine"` and a resolved `data-mode="dark"` on the document root. System is a preference that resolves to light or dark; it is not a third palette.

Motion preference, weight units, and screen-awake behavior remain separate from skin selection. Resolve appearance consistently during initial rendering and restore the user's selection without a visible flash. This infrastructure is new work in the inspected checkout.

### Introduce semantic roles before multiplying palettes

The current `cyan` token supplies brand actions, focus, and success styling. `magenta` supplies destructive/error treatments as well as other colored accents. Recoloring those tokens alone can make a skin's brand color carry unintended meaning.

| Proposed role | Why it matters |
| --- | --- |
| Brand / on-brand / brand-subtle | Primary actions, selected navigation, and supporting tint |
| Focus | A visible keyboard focus indicator across every surface |
| Success / success-subtle | Successful saves and positive state feedback |
| Danger / danger-subtle | Destructive controls and error feedback |
| Warning / warning-subtle | Caution that remains distinct from decoration |
| Chart categories | Consistent group mapping with labels across screens |
| Surface pattern / card shadow / border weight | Optional skin character without changing content structure |
| Label family / casing / tracking | Softer or editorial skins without global CSS overrides |

Existing color-named tokens can remain during migration, but audit each use before assigning a semantic replacement. A skin must not change the meaning of a chart category or reverse success and error associations.

### Keep the system bounded

- Preserve the four navigation destinations, control behavior, data definitions, and content order.
- Keep the 26rem shell and responsive rules shared initially. A skin is not a separate layout fork.
- Use the existing fonts for early prototypes; introduce another family only when it materially distinguishes a chosen skin.
- Keep decorative artwork optional. Loading failures or hidden backgrounds should leave a complete interface.
- Specify base, surface, elevated, primary text, secondary text, muted text, borders, focus, and interaction states for both modes.
- Update native `color-scheme`, selection styling, scrollbars, and browser theme color along with the palette.
- Do not add perpetual motion to make a skin recognizable. Static composition should carry its identity.

## How skin selection could look

Present the skin gallery as a set of miniature previews using the same real sample workout. Each preview should include a title, primary button, card, and one data row so users see more than a color swatch.

Selecting a skin opens a larger preview with Home, a form, and a chart. Provide Apply and Cancel, preserve the previous selection on cancel, and label the active skin clearly. Show Light, Dark, and System separately, with the preview following the selected mode.

For personal expression, per-user selection is the recommended direction. If skin selection remains an admin-wide control as suggested by the screenshot, explicitly state that scope; do not silently change everyone else's interface when one person previews a skin.

## Suggested rollout

1. **Establish the baseline:** capture the current PULSE tokens, identify semantic-color uses, and add skin/mode resolution. Preserve PULSE as a selectable original.
2. **Prototype Alpine and Clay:** they test different palettes and expose whether labels, fields, and alerts can be themed cleanly.
3. **Add Track:** test stronger display hierarchy and graphic details through a complete workout journey.
4. **Evaluate Nocturne, Blueprint, and Mono Print:** select based on which adds the most distinct experience to the gallery.
5. **Build Arcade only with a cohesive artwork set:** a few unrelated pixel icons would not justify a separate skin.

Before shipping any skin, review Dashboard, session detail, live timer, builder, Analytics, and Edit profile in both modes. Include error/success states, long names, empty data, selected controls, keyboard focus, larger text, and narrow mobile widths. Measure contrast for the final tokens and actual composited surfaces. A palette sketch alone is not a completed skin.
