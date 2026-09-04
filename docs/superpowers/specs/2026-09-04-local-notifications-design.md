# Local Notifications Design (2026-09-04)

## Problem

`nextReminder()` only renders a card on the Home screen. If the user never opens
the app, the reminder never exists. The "gentle support" promise (Profile >
Saving reminders) needs OS-level local notifications for due scheduled deposits
and approaching deadlines.

Correction recorded during brainstorming: `expo-notifications` is NOT currently
installed (verified: absent from `package.json`, zero imports repo-wide). Adding
it is part of this work.

## Goals

- Fire a local notification for each due recurring deposit and approaching
  deadline, gated by the existing `remindersEnabled` settings toggle.
- Card and ping can never disagree: both derive from the same guards.
- No server, push infrastructure, or background tasks.

## Non-goals

- Push notifications, background fetch/task scheduling.
- Generic daily "check your jars" repeater (cut: trains users to ignore).
- Home-card or per-jar UI changes beyond the Profile toggle behavior below.

## Decisions (approved)

- Approach A: foreground resync. Recompute and reschedule on every app
  foreground and on every jars/settings change. Reminders are only as fresh as
  the last app open; recurring `nextDate`s are precomputed, so weekly opens
  still yield correct upcoming fires.
- Permission timing: request OS permission on toggle-on.
- Scheduling strategy: resync on open (not schedule-far-ahead; avoids the iOS
  64-notification cap and stale-fire repair paths).

## Architecture

One new module owns all OS contact:

- `lib/notifications.ts`
  - `dueNotifications(jars, now, currency): { jarId, fireDate, title, detail }[]`
    — pure derivation, unit-tested. Inputs reuse existing logic untouched:
    recurring `nextDate` windows from `lib/reminders.ts` rules; deadline dates
    via `parseDeadline` (exported from `lib/savings-core.ts` with no behavior
    change to `deadlineCountdown`). Fire times mirror the Home card windows
    (morning local time; exact trigger hour pinned by tests). Skip set: archived, funded, paused,
    amount <= 0, past dates, unparseable deadlines.
  - `resyncNotifications(jars, { enabled })` — cancel-all, then schedule the
    derived list. Toggle-off path calls cancel-all the same tick (kill-switch).
  - `requestPermissionAndEnable()` — used by the Profile toggle.
- `useNotificationResync()` hook, mounted inside the providers in
  `app/_layout.tsx`: re-runs resync on `AppState` foreground and whenever
  `jars` or `remindersEnabled` change. No existing mutation path is touched;
  edits, deposits, and recurring catch-ups self-heal the schedule.
- `app/(tabs)/profile.tsx`: toggle-on calls `requestPermissionAndEnable()`.
  Granted → `setRemindersEnabled(true)` + immediate resync. Denied → toggle
  stays off with a one-line note pointing at system Settings; never re-prompts.
- Web platform: scheduler is a no-op (notifications unsupported), following the
  `Platform.OS !== "web"` precedent in `lib/haptics.ts`.

## Data flow

jars + settings change / foreground → `resyncNotifications` → cancel-all →
`dueNotifications` (pure) → `scheduleNotificationAsync` per item.
Home card (`nextReminder`) reads the same guards, so card and ping agree.

## Native dependency

- `npx expo install expo-notifications` (config plugin wires permission strings;
  no hand-edited `app.config.ts` beyond plugin defaults).
- Next native build must be a dev-client/EAS build; Expo Go will not carry the
  new native module.

## Testing

- Failing-first `vitest` cases for `dueNotifications` (due recurring, deadline
  morning, full skip set), in the `tests/reminders.test.ts` fixture style.
- The thin `expo-notifications` wrapper is an OS boundary: not unit-tested,
  verified manually.
- Regression: `lib/reminders.ts` untouched; `pnpm test` and `pnpm check` green.
- Manual pass: grant → schedules appear; deny → toggle stays off; toggle-off →
  nothing scheduled; foreground after edits → schedule matches current jars.

## Rollout

1. Install dependency.
2. Fresh dev-client/EAS build.
3. Manual verification pass above. No server changes.
