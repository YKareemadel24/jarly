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
