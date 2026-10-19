# Remaining Saving Jar Roadmap Implementation Plan

> **For agentic workers:** Execute inline with superpowers:executing-plans. Use the user-approved roadmap items R6–R12 as the scope.

**Goal:** Complete the remaining notification, calendar, activity, dependency, accessibility, convention, and OTA-readiness roadmap work.

**Architecture:** Keep the existing local-first architecture. Fix notification ordering in the current lazy notifications module, date semantics in pure domain code, and Activity with React Native's built-in `SectionList`. Move route styles into `components/` and keep dependency changes scoped to evidenced advisory paths.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript 6, Expo Router 7, Vitest, pnpm.

**Spec:** `saving-jar-audit-2026-10-18.md`, roadmap items R6–R12.

## Global Constraints

- All money is integer minor units — never floats.
- `lib/domain/*` must stay pure: no React, no AsyncStorage, no network.
- Styles live in `components/`, never in `app/`.
- `expo-notifications` is imported only lazily via `lib/notifications.ts`.
- All savings data is device-local; do not add a backend or upload savings data.
- Keep existing Expo SDK / React Native compatibility. Upgrade a test-only major when a maintained patched release is required by a current advisory.
- Do not publish an EAS Update or perform a production release without final user approval.

## Review Focus

- A disable arriving while an older notification rebuild is awaiting the OS must leave no reminders scheduled.
- Failed settings or savings hydration must not schedule notifications from default state.
- Date-only and month-year deadlines must identify the same local calendar day across DST boundaries.
- Activity with thousands of entries must mount only visible transaction rows and retain day grouping.
- Dependency upgrades must preserve the app's Expo toolchain and avoid hiding unresolved advisories with blind overrides.

## Files and task boundaries

- R6: `lib/notifications.ts`, `components/notification-resync.tsx`, `app/_layout.tsx`, `app/(tabs)/profile.tsx`, `tests/notifications.test.ts`.
- R7: `lib/domain/insights.ts`, `lib/reminders.ts`, `lib/notifications.ts`, `tests/savings-core.test.ts`, `tests/reminders.test.ts`, `tests/notifications.test.ts`.
- R8: `app/(tabs)/activity.tsx`, new `components/activity.styles.ts`, `tests/` if a focused pure grouping test is practical.
- R9: `package.json`, `pnpm-lock.yaml`, and dependency-check evidence; change only packages supported by current advisory and reachability findings.
- R10: `app/(tabs)/profile.tsx`, `app/jar/new.tsx`, `app/(tabs)/index.tsx`, `components/home.styles.ts`.
- R12: `app/(tabs)/index.tsx` and route style modules for `app/jar/new.tsx`, `app/dev/theme-lab.tsx`, `app/(tabs)/activity.tsx`, `app/(tabs)/profile.tsx`, `app/(tabs)/stats.tsx`, `app/transfer/index.tsx`, `app/transfer/receive.tsx`, and `app/transfer/send.tsx`; corresponding new files under `components/`; README and design notes.
- R11: inspect local EAS configuration and channel state; production channel creation, EAS build/update, and publication are separate external release actions and require final approval.

## Tasks

### Task 1: R6 — make notification resync latest-state-wins (complete)

Add focused tests for disable racing a pending enabled rebuild, rejection reporting, and the hydration gate. Serialize/coalesce pending rebuild requests in the existing notifications module, pass both providers' readiness from `NotificationResync`, and report scheduling failures through the existing error seam. Verify permission-request failures are visible in Profile.

### Task 2: R7 — use local calendar-day deadline semantics (complete)

Add failing tests for `December 2026` resolving to local month end, date-only ISO resolving to local midnight, and countdown/reminder behavior around midnight and DST. Parse supported forms before the generic Date fallback and compare calendar-day ordinals in countdown and pace calculations.

### Task 3: R8 — virtualize Activity (complete)

Replace `ScrollView` plus row maps with `SectionList`, retaining the existing date labels, empty state, row content, and separators. Keep the existing presentation through a section-aware row style in `components/` and disable sticky section headers.

### Task 4: R9 — triage and patch dependency advisory paths (targeted fixes complete; registry audit unavailable)

Refresh advisory data from primary sources and inspect the lockfile path for each applicable production or development match. Upgrade compatible patched packages and lockfile entries only; do not use `--force` or an unexplained override. Run the installed test/typecheck tools and audit again.

### Task 5: R10 — finish accessibility and touch targets (complete)

Add accessible names, hints, and switch state to Profile preferences; label all create-jar inputs; expand the Home new-jar action and quick-add chip to at least 44 points without changing their flow. Selected-currency formatting was completed in R1.

### Task 6: R12 — align route and domain boundaries (complete)

Import `weeklyDelta` through the public domain barrel. Move every `StyleSheet.create`/route style factory out of `app/` and into matching `components/` style files, preserving route boundaries and current visuals. Correct any README/design/test coverage notes affected by the completed items and update design's date.

### Task 7: R11 — prepare the production OTA release (local config ready; approval pending)

Confirm the project ID, runtime policy, build channel fields, and current remote channel mapping. If any local configuration is missing, make the smallest local correction and verify it. Do not create a production channel, run a paid EAS build, or publish preview/production updates without final user approval; record the exact remaining release prerequisite.

## Verification

For each code task run its focused Vitest tests and `node node_modules/typescript/bin/tsc --noEmit`. Before completion run the full installed Vitest, TypeScript, Prettier check, ESLint, `git diff --check`, and attempt the repository's `pnpm check`, `pnpm lint`, `pnpm format:check`, and `pnpm test` wrappers. Report any wrapper/environment failure separately from successful direct checks.

## Execution ledger

- R6–R12 are user-authorized implementation scope; production EAS publication remains gated by the approval step above.
- User instruction in repository `AGENTS.md` explicitly sets `master` as the destination branch and requires a push after completion; work stays on that branch.
- Vitest 5.0.5 is required because the October 16, 2026 `GHSA-p458-7748-mcp3` advisory is fixed in 5.0.5; 4.1.12 remains affected.
- The EAS production channel is absent. Channel creation and builds remain gated on release approval.
- `pnpm audit` stalled waiting on registry data and exhausted the Node heap; dependency paths and patched versions were checked against GitHub's reviewed advisory entries and the lockfile.
- Direct tests, typecheck, ESLint, and changed-file Prettier checks pass. The all-repo format check also flags the supplied untracked audit document, which was left unchanged; `pnpm lint` reaches a globally installed pnpm 11.23.0 from Expo and rejects the repository's pinned 9.12.0.
