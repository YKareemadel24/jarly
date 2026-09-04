# Local Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fire OS-local notifications for due recurring deposits and due-day deadlines, gated by the existing Saving-reminders toggle.

**Architecture:** Pure `dueNotifications()` derivation in a new `lib/notifications.ts`, resynced (cancel-all + reschedule) on app foreground and every jars/settings change; permission asked once on toggle-on; web is a no-op.

**Tech Stack:** Expo SDK ~54 (new arch), `expo-notifications` (to be installed), React Native, vitest, `tsc --noEmit`.

**Spec:** `docs/superpowers/specs/2026-09-04-local-notifications-design.md`

## Global Constraints

- Money stays integer minor units; format with existing `money()` from `@/lib/savings-core`.
- `lib/reminders.ts` and `deadlineCountdown` behavior unchanged (existing tests must pass unmodified).
- Web platform is a scheduler no-op (`Platform.OS === "web"` guard).
- No server, push, background-task, or Home-card changes.
- Verify with `pnpm test` (vitest) and `pnpm check` (`tsc --noEmit`).

---

## File map

- Modify: `lib/savings-core.ts` — export the existing `parseDeadline` helper, no logic change.
- Create: `lib/notifications.ts` — pure `dueNotifications()` + OS wrapper (`resyncNotifications`, `requestPermissionAndEnable`, `useNotificationResync`).
- Create: `components/notification-resync.tsx` — null-rendering component that runs the hook inside providers.
- Create: `tests/notifications.test.ts` — failing-first tests for `dueNotifications()`.
- Modify: `app/_layout.tsx` — render `<NotificationResync />` inside `SettingsProvider`.
- Modify: `app/(tabs)/profile.tsx` — toggle-on requests OS permission; toggle-off kills the schedule via the existing state path.
- Install: `expo-notifications` via `npx expo install expo-notifications`.

---

### Task 1: Install dependency + export deadline parser

**Files:**
- Modify: `lib/savings-core.ts` (one word: `function parseDeadline` → `export function parseDeadline`)
- Install: `expo-notifications`

**Interfaces:**
- Consumes: nothing new.
- Produces: `parseDeadline(deadline: string) => Date | undefined` for Task 2; installed `expo-notifications` package for Task 3.

- [ ] **Step 1: Install the dependency**

```bash
npx expo install expo-notifications
```

- [ ] **Step 2: Run typecheck to confirm the install resolves**

Run: `pnpm check`
Expected: PASS (exit 0)

- [ ] **Step 3: Export the existing parser (no logic change)**

```ts
// lib/savings-core.ts — change ONLY the keyword on this line:
export function parseDeadline(deadline: string): Date | undefined {
```

- [ ] **Step 4: Run existing tests to prove no behavior change**

Run: `pnpm vitest run tests/savings-core.test.ts tests/reminders.test.ts`
Expected: PASS, all green, zero test files modified

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml lib/savings-core.ts
git commit -m "Add expo-notifications dep, export parseDeadline"
```

---

### Task 2: Pure due-notification derivation with tests

**Files:**
- Create: `lib/notifications.ts` (pure part only in this task: types + `dueNotifications`)
- Create: `tests/notifications.test.ts`

**Interfaces:**
- Consumes: `Jar`, `money`, `parseDeadline` from `@/lib/savings-core`.
- Produces: `DueNotification = { jarId: string; fireDate: string; title: string; detail: string }` and `dueNotifications(jars: Jar[], now?: Date, currency?: string) => DueNotification[]` for Task 3.

Rules (mirror `nextReminder` guards so card and ping agree; max one notification per jar, recurring outranks deadline):
- Skip jar when: archived, funded (`target > 0 && balance >= target`), no candidate below.
- Recurring candidate: rule present, not paused, amount > 0; `due` = `nextDate` ?? `createdAt`; `days = ceil((due - now) / DAY_MS)`; candidate when `0 <= days <= 1`. `fireDate` = due day at 09:00 local; when that instant is past, `now + 60s`. Title `` `${jar.name} is scheduled` ``, detail `` `${money(rule.amount, currency)} due today.` ``
- Deadline candidate (only when no recurring candidate): parseable deadline whose due day is today (`startOfDay(due) === startOfDay(now)`). `fireDate` = today 09:00 local, or `now + 60s` when past. Title `` `${jar.name} is due today` ``, detail `"A little more today goes a long way."`
- Helper (local, unexported): `const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { dueNotifications } from "../lib/notifications";
import { type Jar } from "../lib/savings-core";

const jar = (overrides: Partial<Jar> = {}): Jar => ({
  id: "trip",
  name: "Japan trip",
  balance: 0,
  target: 10000,
  accent: "ocean",
  icon: "flight",
  kind: "goal",
  createdAt: "2026-01-01T00:00:00.000Z",
  milestonesHit: [],
  entries: [],
  ...overrides,
});

const at = "2026-06-15T12:00:00.000Z";

describe("dueNotifications", () => {
  it("returns empty when nothing is due", () => {
    expect(dueNotifications([jar()], new Date(at))).toEqual([]);
  });

  it("schedules a morning ping for a recurring deposit due today", () => {
    const scheduled = jar({
      recurring: { amount: 2500, cadence: "weekly", paused: false, nextDate: "2026-06-15T09:00:00.000Z" },
    });
    const [ping] = dueNotifications([scheduled], new Date(at));
    expect(ping.jarId).toBe("trip");
    expect(ping.title).toContain("Japan trip");
    expect(ping.detail).toContain("due today");
    expect(new Date(ping.fireDate).getDate()).toBe(15);
  });

  it("prefers the recurring ping over the deadline ping for the same jar", () => {
    const both = jar({
      deadline: "2026-06-15",
      recurring: { amount: 2500, cadence: "weekly", paused: false, nextDate: "2026-06-15T09:00:00.000Z" },
    });
    expect(dueNotifications([both], new Date(at))).toHaveLength(1);
  });

  it("skips archived, funded, and paused jars", () => {
    const jars = [
      jar({ id: "a", archived: true, deadline: "2026-06-15" }),
      jar({ id: "b", balance: 10000, deadline: "2026-06-15" }),
      jar({ id: "c", deadline: "2026-06-15", recurring: { amount: 500, cadence: "weekly", paused: true, nextDate: "2026-06-15T09:00:00.000Z" } }),
    ];
    expect(dueNotifications(jars, new Date(at))).toEqual([]);
  });

  it("schedules a due-day ping for a deadline with no schedule", () => {
    const [ping] = dueNotifications([jar({ deadline: "2026-06-15" })], new Date(at));
    expect(ping.title).toContain("due today");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/notifications.test.ts`
Expected: FAIL with "Failed to resolve import ../lib/notifications" (file does not exist yet)

- [ ] **Step 3: Write minimal implementation**

```ts
import { type Jar, money, parseDeadline } from "@/lib/savings-core";

export type DueNotification = { jarId: string; fireDate: string; title: string; detail: string };

const DAY_MS = 86_400_000;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** 09:00 local on the due day, or one minute from now when that has passed. */
function morningFire(due: Date, now: Date): string {
  const fire = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 9, 0, 0);
  return (fire.getTime() > now.getTime() ? fire : new Date(now.getTime() + 60_000)).toISOString();
}

/**
 * Pure derivation of schedulable nudges. Mirrors nextReminder() guards so the
 * Home card and the OS ping can never disagree. Max one ping per jar.
 */
export function dueNotifications(jars: Jar[], now: Date = new Date(), currency: string = "USD"): DueNotification[] {
  const pings: DueNotification[] = [];
  for (const jar of jars) {
    if (jar.archived) continue;
    if (jar.target > 0 && jar.balance >= jar.target) continue;

    const rule = jar.recurring;
    if (rule && !rule.paused && rule.amount > 0) {
      const due = rule.nextDate ? new Date(rule.nextDate) : new Date(jar.createdAt);
      const days = Math.ceil((due.getTime() - now.getTime()) / DAY_MS);
      if (days >= 0 && days <= 1) {
        pings.push({
          jarId: jar.id,
          fireDate: morningFire(due, now),
          title: `${jar.name} is scheduled`,
          detail: `${money(rule.amount, currency)} due today.`,
        });
        continue;
      }
    }

    if (jar.deadline) {
      const due = parseDeadline(jar.deadline);
      if (due && startOfDay(due) === startOfDay(now)) {
        pings.push({
          jarId: jar.id,
          fireDate: morningFire(due, now),
          title: `${jar.name} is due today`,
          detail: "A little more today goes a long way.",
        });
      }
    }
  }
  return pings;
}
```

- [ ] **Step 4: Run tests to verify green**

Run: `pnpm vitest run tests/notifications.test.ts`
Expected: PASS (5/5), then run `pnpm test` — full suite green

- [ ] **Step 5: Commit**

```bash
git add lib/notifications.ts tests/notifications.test.ts
git commit -m "Add pure dueNotifications derivation with tests"
```

---

### Task 3: OS wrapper — schedule, permission, resync hook

**Files:**
- Modify: `lib/notifications.ts` (append OS section; pure part from Task 2 untouched)

**Interfaces:**
- Consumes: `dueNotifications` from Task 2; `Jar` type; `expo-notifications`, `react-native` (`Platform`, `AppState`), `react`.
- Produces: `resyncNotifications(jars, opts)`, `requestPermissionAndEnable()`, `useNotificationResync()` for Task 4.

- [ ] **Step 1: Append the OS wrapper to lib/notifications.ts**

```ts
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("reminders", {
    name: "Saving reminders",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/**
 * Rebuild the OS schedule from current jars. Cancel-all-then-schedule keeps
 * edits, deposits, and recurring catch-ups self-healing. Web is a no-op.
 */
export async function resyncNotifications(
  jars: Jar[],
  opts: { enabled: boolean; currency?: string; now?: Date },
): Promise<void> {
  if (Platform.OS === "web") return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!opts.enabled) return;
  await ensureAndroidChannel();
  const now = opts.now ?? new Date();
  for (const ping of dueNotifications(jars, now, opts.currency)) {
    await Notifications.scheduleNotificationAsync({
      content: { title: ping.title, body: ping.detail },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(ping.fireDate) },
    });
  }
}

/** Ask the OS for permission once. Returns true only when alerts can fire. */
export async function requestPermissionAndEnable(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}
```

- [ ] **Step 2: Append the resync hook (same file)**

```ts
/** Re-runs the OS schedule on foreground and whenever inputs change. */
export function useNotificationResync(
  jars: Jar[],
  opts: { enabled: boolean; currency?: string },
): void {
  useEffect(() => {
    if (Platform.OS === "web") return;
    void resyncNotifications(jars, opts);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void resyncNotifications(jars, opts);
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jars, opts.enabled, opts.currency]);
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm check`
Expected: PASS (if `SchedulableTriggerInputTypes` drifts in the installed version, use whatever DATE-trigger shape `tsc` accepts — keep the date-trigger behavior, do not switch to calendar/daily triggers)

- [ ] **Step 4: Run full test suite (pure part must stay green)**

Run: `pnpm test`
Expected: PASS, no test files modified

- [ ] **Step 5: Commit**

```bash
git add lib/notifications.ts
git commit -m "Add notification OS wrapper and resync hook"
```

---

### Task 4: Wire toggle + layout, verify end to end

**Files:**
- Create: `components/notification-resync.tsx`
- Modify: `app/_layout.tsx` (render gate inside `SettingsProvider`)
- Modify: `app/(tabs)/profile.tsx` (permission-on-toggle-on; denied path)

**Interfaces:**
- Consumes: `useNotificationResync`, `requestPermissionAndEnable`, `resyncNotifications` from `@/lib/notifications`; `useSavings`, `useSettings`.

- [ ] **Step 1: Create the null-rendering gate component**

```tsx
import { useSavings } from "@/lib/savings-store";
import { useSettings } from "@/lib/settings-store";
import { useNotificationResync } from "@/lib/notifications";

export function NotificationResync() {
  const { jars } = useSavings();
  const { remindersEnabled, currency } = useSettings();
  useNotificationResync(jars, { enabled: remindersEnabled, currency });
  return null;
}
```

- [ ] **Step 2: Mount it inside the providers in app/_layout.tsx**

Inside the `content` tree, within `SettingsProvider` (both web and native return branches use the same `content`), add next to `<LockScreen />`:

```tsx
<SavingJarStatusBar />
<LockScreen />
<NotificationResync />
```

And add the import:

```tsx
import { NotificationResync } from "@/components/notification-resync";
```

- [ ] **Step 3: Gate the Profile toggle on OS permission**

In `app/(tabs)/profile.tsx`, add imports:

```tsx
import { Alert } from "react-native";
import { requestPermissionAndEnable } from "@/lib/notifications";
```

Replace the reminders `Preference` line:

```tsx
<Preference icon="notifications-none" title="Saving reminders" detail="Nudges for due deposits and deadlines" value={remindersEnabled} onChange={onRemindersChange} styles={styles} colors={colors} />
```

And add the handler above the `return` (next to `onPinLockChange`):

```tsx
const onRemindersChange = (next: boolean) => {
  if (!next) {
    setRemindersEnabled(false);
    return;
  }
  void requestPermissionAndEnable().then((granted) => {
    if (granted) {
      setRemindersEnabled(true);
    } else {
      Alert.alert(
        "Notifications off",
        "Saving reminders stays off until you allow notifications in system Settings.",
      );
    }
  });
};
```

(Toggle-off cancels via the resync effect observing `enabled === false`; no direct cancel call needed — single path.)

- [ ] **Step 4: Run full verification**

Run: `pnpm test`
Expected: PASS, all files green

Run: `pnpm check`
Expected: PASS (exit 0)

- [ ] **Step 5: Manual device pass (dev-client build required — Expo Go lacks the native module)**

  - Fresh install → Profile → toggle Saving reminders on → OS prompt appears → Allow → toggle on.
  - Create jar with weekly recurring due tomorrow → background the app → notification fires tomorrow 09:00 local.
  - Toggle off → no further notifications fire.
  - Deny permission (fresh install or revoked) → toggle stays off + alert shows; no re-prompt on next toggle until OS settings change.
  - Edit jar (pause schedule) → foreground → stale notification gone.

- [ ] **Step 6: Commit**

```bash
git add components/notification-resync.tsx app/_layout.tsx "app/(tabs)/profile.tsx"
git commit -m "Wire notification permission toggle and resync gate"
```
