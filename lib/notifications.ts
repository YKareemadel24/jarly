import { type Jar, money, parseDeadline } from "@/lib/savings-core";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";

/**
 * `expo-notifications` is imported lazily, and never on web. Importing it runs a
 * push-token auto-registration side effect that warns on every web load, so the
 * OS-touching functions below await this loader instead of a static import.
 */
type NotificationsApi = typeof import("expo-notifications");

let apiPromise: Promise<NotificationsApi> | null = null;
let handlerRegistered = false;

async function notifications(): Promise<NotificationsApi | null> {
  if (Platform.OS === "web") return null;
  apiPromise ??= import("expo-notifications");
  const api = await apiPromise;
  if (!handlerRegistered) {
    api.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    handlerRegistered = true;
  }
  return api;
}

export type DueNotification = {
  jarId: string;
  fireDate: string;
  title: string;
  detail: string;
};

const DAY_MS = 86_400_000;

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** 09:00 local on the due day, or one minute from now when that has passed. */
function morningFire(due: Date, now: Date): string {
  const fire = new Date(
    due.getFullYear(),
    due.getMonth(),
    due.getDate(),
    9,
    0,
    0,
  );
  return (
    fire.getTime() > now.getTime() ? fire : new Date(now.getTime() + 60_000)
  ).toISOString();
}

/**
 * Pure derivation of schedulable nudges. Mirrors nextReminder() guards so
 * every scheduled ping has a matching Home card, while cards may appear
 * without a ping (deadline pings are due-day-only; the card window is 3 days).
 * Max one ping per jar.
 */
export function dueNotifications(
  jars: Jar[],
  now: Date = new Date(),
  currency: string = "USD",
): DueNotification[] {
  const pings: DueNotification[] = [];
  for (const jar of jars) {
    if (jar.archived) continue;
    if (jar.target > 0 && jar.balance >= jar.target) continue;

    const rule = jar.recurring;
    if (rule && !rule.paused && rule.amount > 0) {
      const due = rule.nextDate
        ? new Date(rule.nextDate)
        : new Date(jar.createdAt);
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

async function ensureAndroidChannel(api: NotificationsApi): Promise<void> {
  if (Platform.OS !== "android") return;
  await api.setNotificationChannelAsync("reminders", {
    name: "Saving reminders",
    importance: api.AndroidImportance.DEFAULT,
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
  const api = await notifications();
  if (!api) return;
  await api.cancelAllScheduledNotificationsAsync();
  if (!opts.enabled) return;
  await ensureAndroidChannel(api);
  const now = opts.now ?? new Date();
  for (const ping of dueNotifications(jars, now, opts.currency)) {
    await api.scheduleNotificationAsync({
      content: { title: ping.title, body: ping.detail },
      trigger: {
        type: api.SchedulableTriggerInputTypes.DATE,
        date: new Date(ping.fireDate),
        ...(Platform.OS === "android" ? { channelId: "reminders" } : null),
      },
    });
  }
}

/** Ask the OS for permission once. Returns true only when alerts can fire. */
export async function requestPermissionAndEnable(): Promise<boolean> {
  const api = await notifications();
  if (!api) return false;
  const current = await api.getPermissionsAsync();
  if (current.granted) return true;
  const next = await api.requestPermissionsAsync();
  return next.granted;
}

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
