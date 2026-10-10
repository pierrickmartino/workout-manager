# Vercel React Native skills audit: 10 October 2026

**Audit date:** 10 October 2026. **Reviewed:** `fb20d29` (branch
`docs/vercel-react-audit`). **Skill:** `vercel-react-native-skills`
(`.claude/skills/vercel-react-native-skills/`).

## Verdict: not applicable today

The repository has no React Native or Expo code:

- `apps/` holds only `api` (FastAPI) and `web` (Next.js App Router PWA).
- No `package.json` depends on `react-native` or `expo`.
- There is no `app.json`, `eas.json` or `metro.config.*`.

Most of the skill's rules are about native APIs (FlashList, Reanimated, native
navigators, `expo-image`, `Pressable`, native modals and menus, safe-area ScrollViews,
font config plugins, native dependencies in a monorepo). They have nothing to apply to,
so **this audit produces no code tasks.** The web app's own performance audit is
[react-best-practices-2026-10-10](react-best-practices-2026-10-10.md).

## The rules that also apply to web React

Two rules are not native-specific. Both were checked on `apps/web` and both pass:

| Rule | Check | Result |
| --- | --- | --- |
| `rendering-no-falsy-and` | Swept the JSX for `{x && <…>}` where `x` could be `0` or `""` (counts, lengths, totals) | **Pass.** Every JSX `&&` condition is a boolean (`is*`, `has*`, comparisons). The renderable-`0` bug was not found. |
| `js-hoist-intl` | Swept for `new Intl.*` and `toLocale*String` calls with options | **Pass, nothing worth doing.** `lib/instant.ts` (`formatInstantLocal`), `SyncStatusBanner` and `resume-session-banner` each format one value after mount. `level-badge` calls `toLocaleString()` without options on four numbers. None of them runs in a hot loop, so hoisting a formatter would gain nothing measurable. |

The list rules (`list-performance-item-memo`, `-callbacks`, `-inline-objects`) do have
web equivalents. They are covered by the web audit's `rerender-*` and
`rendering-content-visibility` findings (see V-1 there), so they are not repeated here.

## If a native client is chosen

TASKS §3 keeps open an ADR on **native shell vs PWA-only**, and §9 (Gript P0-2) one on
offline training. If either ends with a React Native / Expo client, these rules matter
first for this domain:

1. **`list-performance-virtualize` and `-item-memo`:** History, the exercise catalog
   and the Logged Set tables are the long lists. Use FlashList with memoized rows and
   stable callbacks.
2. **`monorepo-native-deps-in-app` and `monorepo-single-dependency-versions`:**
   - A third `apps/mobile` package must keep its native dependencies in its own
     `package.json`.
   - It must share one React version with `apps/web`, which pins exact versions per
     CLAUDE.md.
3. **`animation-gpu-properties` and `animation-derived-value`:**
   - The rest timer and set-completion microinteractions (TASKS §10) should animate
     only transform and opacity, on the UI thread.
   - This lines up with the web motion policy (`lib/motion-policy.ts`).
4. **`navigation-native-navigators`:** the tab bar and sidebar registry
   (`lib/shell-a11y`, ADR-0088) map onto native tabs plus a native stack.
5. **`ui-safe-area-scroll` and `ui-native-modals`:** the Live Session screen and the
   confirm dialogs (`components/pulse/confirm-dialog.tsx`) are where safe areas and
   native sheets matter most.
6. **`ui-expo-image`:** catalog exercise images (plain `<img>` on web, ADR-0095).

When a native client exists, run this audit again.
