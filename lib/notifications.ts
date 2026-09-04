import { type Jar, money, parseDeadline } from "@/lib/savings-core";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";

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
