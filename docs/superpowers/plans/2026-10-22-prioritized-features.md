# Prioritized Features Implementation Plan

> **For agentic workers:** Implement the authorized five-feature update in the existing checkout. Independent file sets may be delegated; integrate and review the full diff before one commit to master.

**Goal:** Make recorded savings correctable and recoverable, show actionable savings plans, personalize reminders, and filter activity.

**Architecture:** Reuse the existing local store, pure domain functions, transfer codec/merge validation, theme styles, and sheets. Preserve existing records and automatic recurring-deposit behavior. No backend or accounts.

**Tech Stack:** Expo SDK 57, React Native 0.86, React 19, TypeScript, Vitest. Native file picking/sharing may use Expo modules matched to SDK 57.

**Spec:** The five prioritized features approved in this chat; details below resolve routine implementation choices.

## Global Constraints

- Money remains safe integer minor units; reject changes that create negative balances, impossible withdrawal histories, or unsafe active totals.
- All savings data remains device-local. Backups contain jars and currency, never PINs, biometric credentials, or environment settings.
- Styles live in components. expo-notifications remains lazily imported through lib/notifications.ts.
- Preserve existing schedules and data; no automatic destructive restore or migration.
- Run pnpm check, the full test suite, lint, formatting, and browser checks before committing and pushing to YKareemadel24/jarly master.

## Review Focus

- Correcting a deposit after a later withdrawal must not produce an impossible history; old amount/date/note remain visible in a revision trail.
- Repeated Undo or Restore must not apply a change twice; restoration must reject conflicting histories and currency mismatches before committing any jar.
- Backups with malformed/oversized content or altered balances must fail validation without replacing local data.
- Reminder hours/days, snooze dates, and pause states must survive storage and transfer, respect the global permission toggle, and never record a deposit.
- Date filters use local calendar boundaries; plans describe estimates, not guaranteed completion dates.

## Task 1: Transaction correction and Undo (root)

Files: lib/domain/jar.ts, lib/domain/transactions.ts, lib/domain/index.ts, lib/savings-store.tsx, shared/transfer.ts, lib/transfer-merge.ts, lib/savings-storage.ts, app/jar/[id].tsx, components/edit-entry-sheet.tsx and styles, tests/transactions.test.ts, tests/transfer.test.ts.

- [x] Add optional Entry.revisions: EntryRevision[] where each prior amount/at/note and changedAt are retained; direction remains unchanged.
- [x] Implement correctEntry(jar, entryId, {amount, at, note}, now): Jar | null and undoEntry(jar, entryId, now): Jar | null. Corrections preserve the opening balance, validate chronological withdrawals, reorder entries by date, recalculate habit streak metadata, and preserve celebrated milestones.
- [x] Store methods correctEntry and undoEntry return boolean, validate safe active totals, and use fresh jarsRef state. Undo uses an explicit opposite transaction linked with undoOf; both sides remain visible, and effectiveEntries excludes them from contribution statistics.
- [x] Reject duplicate Undo and unsafe withdrawals; tests cover both directions, replay safety, and exclusion from contribution statistics.
- [x] Entry rows open an amount/date/note correction sheet; expose revision history. Deposit and withdrawal success offer Undo with truthful errors when reversal cannot be applied.
- [x] Extend transfer validation/round-trip for revisions and per-jar reminder settings without losing older snapshots. Update persistence/merge checks to preserve these fields.
- [x] Tests first: amount/date correction, invalid date/future date/zero/overflow, legacy opening balance, insufficient funds after correction, streak recalculation, audit round-trip, duplicate undo.

## Task 2: File backup/restore (backup agent)

Files owned: lib/backup.ts, lib/backup-files.ts, components/backup-panel.tsx, components/backup.styles.ts, app/(tabs)/profile.tsx, tests/backup.test.ts, package.json and pnpm-lock.yaml only if native file modules are required.

- [x] Create a versioned .jarly backup containing existing transfer frames; validate bounded content with decodeTransferFrames and mergeTransferJars.
- [x] Export an actual downloadable file on web and a user-controlled native file/share sheet. Pick a local file for restore on both platforms.
- [x] Show exported date, currency, jar/entry counts, total and merge preview before Restore; keep local jars and reject conflicts. Use existing store exportTransfer/importTransfer; root owns store/schema changes.
- [x] Exclude security settings. Include completed and archived jars. Never perform external uploads.
- [x] Tests first: empty/populated round trip, malformed/future/oversized data, currency conflict, repeated restore and archive preservation. If modules are added, obtain current official SDK documentation and install compatible Expo versions.

## Task 3: Savings plans and activity filters (planning agent)

Files owned: components/savings-plan.tsx, components/savings-plan.styles.ts, app/(tabs)/activity.tsx, components/activity.styles.ts, lib/activity-sections.ts, tests/activity-sections.test.ts, tests/savings-plan.test.ts if nontrivial view-model logic is needed.

- [x] Export SavingsPlan({jar}: {jar: Jar}) using existing paceProjection and useMoney. Root will mount it in jar detail.
- [x] Show required weekly amount, recent pace and estimated completion only when enough history exists; handle undated, past-due, funded and no-pace cases. Label projection as an estimate. Keep money integer.
- [x] Activity filters: jar, direction (all/deposit/withdrawal), and date range (all/7 days/30 days). Use explicit labeled controls and a clear reset, retain archived-history policy, and distinguish no activity from no matches.
- [x] Extend activitySections(jars, now?, filters?) compatibly. Filter by local calendar days including today; preserve stable ordering.
- [x] Tests first: combined filters, exact date boundaries, empty matches, archived exclusions, existing callers unchanged.

## Task 4: Personal reminders (reminders agent)

Files owned: lib/domain/reminder.ts, lib/notifications.ts, lib/reminders.ts, components/jar-reminder-settings.tsx, components/jar-reminder.styles.ts, tests/reminder-settings.test.ts, tests/notifications.test.ts, tests/reminders.test.ts.

- [x] Root adds JarReminder = {enabled:boolean; hour:number; minute:number; weekdays:number[]; snoozedUntil?:string}; Jar.reminder?: JarReminder and editJar support. Sunday=0, Saturday=6. Undefined preserves old reminders.
- [x] Export isValidJarReminder(value: unknown): value is JarReminder and pure next-date helpers in lib/domain/reminder.ts. Root will export/validate them at persistence and transfer boundaries.
- [x] Export JarReminderSettings({jar}: {jar: Jar}); root mounts it in detail. Provide time, weekdays, enable/pause, snooze one day, clear snooze. Empty weekday selection and invalid times cannot save. Honor global notifications permission and explain web limitations.
- [x] Personal reminders are distinct from automatic recurring deposits. Keep default 09:00 summary and old due reminders for jars without custom settings. Explicit paused reminders suppress that jar's OS pings.
- [x] Native custom reminders recur on selected weekdays. Snooze must suppress the snoozed interval even while app is closed; use a bounded rolling queue if required, with platform schedule capacity respected and UI/docs explaining foreground refresh.
- [x] Tests first: weekday/time validation, DST/local-day next dates, pause/snooze, archived/completed suppression, global disable, resync and scheduling failures.

## Task 5: Integration, documentation and release (root)

- [x] Integrate plan and reminder components in detail; verify no ownership conflicts and no data shape is dropped in transfer/backup.
- [x] Update README structure/features/dependencies and design.md with current date, correction/audit, restore flow, filter behavior and reminder scheduling limits.
- [x] Run full tests, pnpm check, lint, format and real web build/preview. Exercise corrections/Undo, backup/restore preview, reminders, filters, and empty states.
- [x] Review full diff, fix meaningful findings, commit related changes once and push master. Report new-native-build requirements and untested native capabilities.

## Validation

- 181 tests passed across 17 files; pnpm check passed; formatting passed; lint had no errors (existing warnings remain).
- Production web export succeeded for all 16 routes. Phone-sized browser checks covered correction/audit, Undo, savings plans, reminder save/snooze, combined activity filters/reset and backup export/preview/repeated restore.
- Review findings were fixed with regressions for historical funding, future timestamps, large integer ledgers, distant projections and optional settings during restore.
- Native file picker/share sheets and OS delivery need hardware validation. Version 2.1.0 requires a new native build; personal notification queues require regular app reopening.
