import { type Jar, deadlineCountdown, money } from "@/lib/savings-core";

/** Days ahead a recurring deposit or deadline triggers a reminder. */
const RECURRING_LOOKAHEAD_DAYS = 1;
const DEADLINE_LOOKAHEAD_DAYS = 3;

const DAY_MS = 86_400_000;

/**
 * Compute a short, human reminder for the most pressing jar, if a nudge is due.
 *
 * Rules:
 * - A recurring jar with a scheduled deposit due today or tomorrow yields
 *   "Scheduled for X" and is always top priority.
 * - An active, unfunded goal with an approaching deadline (within a few days)
 *   yields "Due in N days" for opening the deposit flow.
 * - Completed jars never remind.
 */
export function nextReminder(jars: Jar[], now: Date = new Date(), currency: string = "USD"): { jar: Jar; title: string; detail: string } | undefined {
  const candidates: { jar: Jar; priority: number; title: string; detail: string }[] = [];

  for (const jar of jars) {
    if (jar.archived) continue;
    if (jar.target > 0 && jar.balance >= jar.target) continue;

    const rule = jar.recurring;
    if (rule && !rule.paused && rule.amount > 0) {
      const due = rule.nextDate ? new Date(rule.nextDate) : new Date(jar.createdAt);
      const days = Math.ceil((due.getTime() - now.getTime()) / DAY_MS);
      if (days >= 0 && days <= RECURRING_LOOKAHEAD_DAYS) {
        candidates.push({
          jar,
          priority: 2, // recurring nudges outrank deadline nudges
          title: `${jar.name} is scheduled`,
          detail: `${money(rule.amount, currency)} due ${days === 0 ? "today" : "tomorrow"}.`,
        });
        continue;
      }
    }

    if (jar.deadline) {
      const label = deadlineCountdown(jar.deadline, now);
      if (label === "Due today" || label === "1 day left") {
        candidates.push({ jar, priority: 1, title: `${jar.name} is due ${label.toLowerCase()}`, detail: "A little more today goes a long way." });
      } else if (label && label.endsWith("days left")) {
        const days = Number.parseInt(label, 10);
        if (!Number.isNaN(days) && days <= DEADLINE_LOOKAHEAD_DAYS) {
          candidates.push({ jar, priority: 1, title: `${jar.name} deadline is near`, detail: label === "2 days left" || label === "3 days left" ? `Only ${days} days left.` : `${days} days left.` });
        }
      }
    }
  }

  candidates.sort((a, b) => b.priority - a.priority || a.detail.length - b.detail.length);
  const top = candidates[0];
  if (!top) return undefined;
  return { jar: top.jar, title: top.title, detail: top.detail };
}