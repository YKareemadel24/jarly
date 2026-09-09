# Saving Jar UI/UX Redesign

## Goal

Apply the supplied redesign's decision-focused savings experience to the existing Expo app while preserving local-first data, integer-minor money values, accessible touch targets, dark mode, reduced-motion settings, recurring deposits, and undoable withdrawals.

## Scope and Constraints

- Reuse the existing `paceProjection` domain function; do not introduce a second pacing model.
- Reuse Expo, React Native, Reanimated, and the installed icon set. Do not port the Vite prototype or add dependencies.
- Preserve all uncommitted changes in `app/jar/[id].tsx`, especially its notification-related behavior.
- Keep every monetary calculation in integer minor units and use the active currency formatter for display.
- Respect the operating-system reduced-motion preference and provide accessible labels for interactive controls.
- Keep the existing four tabs. Home, Insights, creation, and jar detail are redesigned in place.

## Information Architecture

Home reduces competing calls to action to one balance hero, one pace-driven action, then the jar list. The action selects the first jar behind pace; if none are behind, it selects the closest active jar. Completed jars remain visually separated below active jars.

Jar detail makes progress actionable: the existing pace projection appears as a text status and concrete required weekly contribution. The visual progress rail includes 25/50/75% markers and a current-pace indicator where the deadline is usable. Activity is grouped into readable time sections instead of one unbroken list.

The deposit and withdrawal sheet replaces the OS text keyboard for the amount with a fixed, accessible numeric keypad. It previews the post-transaction balance and percent; deposits additionally offer goal-aware choices: the last usual deposit, the weekly pace amount, the next milestone, and the remaining amount. Invalid withdrawal amounts remain rejected before persistence.

Creation starts from a compact set of templates. Selecting a template fills name, icon, accent, target, goal type, and timeline; target and timeline controls show the required weekly and daily saving rate live.

Insights adds an 84-day deposit heatmap, 12-week trend, allocation bar, and an attention metric. These derive entirely from local jar entries and do not add server data.

## Visual and Motion Design

Use the existing warm token system, with a richer accent wash in jar detail and a compact dark balance hero. Continue using tabular figures for money. Prefer the native system font stack rather than bundling font files; this applies the suggestion's hierarchy through scale and weight without a new asset dependency.

The jar vessel retains its glass silhouette, milestone ticks, and coin-drop feedback. It gains a subtle animated liquid surface and spring-driven fill where supported; reduced-motion renders a static fill. Deposit previews may use a translucent second fill. Milestone celebrations retain the current modal safety model but add a short accent-colored burst and spring entrance, always reduced-motion safe.

## Data, Error Handling, and Testing

Pure selectors for home actions, smart deposit options, activity grouping, and insight series belong in `lib/savings-core.ts`, with Vitest coverage. UI screens consume those selectors and retain existing store mutations. The test suite must cover no-deadline, funded, behind/on-track, duplicate preset, empty activity, and zero-total allocation cases. Type check, lint, unit tests, and a web render smoke check must pass before delivery.

## Files Expected to Change

- `lib/savings-core.ts` and `tests/savings-core.test.ts`: derived UI data and tests.
- `app/(tabs)/index.tsx`: compact home hierarchy and next-best-action card.
- `app/(tabs)/stats.tsx`: trend, consistency, allocation, and attention views.
- `app/jar/[id].tsx`: pace marker, grouped activity, keypad sheet, smart presets, celebration polish.
- `app/jar/new.tsx`: templates and live savings math.
- `components/jar-vessel.tsx`: liquid/preview/reduced-motion presentation.

## Explicitly Deferred

- Cross-device sync, social sharing, new analytics, and downloadable font assets.
- Replacing native navigation or adding a web-only animation/chart library.
