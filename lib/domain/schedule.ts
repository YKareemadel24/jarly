/**
 * Recurring-deposit scheduling for the Saving Jar domain.
 *
 * A recurring rule has a computable nextDate and can be caught up
 * deterministically: every missed occurrence is applied exactly once, in
 * order, and `nextDate` always ends up in the future.
 */

import { type Cadence, type Jar, type RecurringRule, applyEntry } from "./jar";

export function addCadence(from: Date, cadence: Cadence): Date {
  const next = new Date(from);
  switch (cadence) {
    case "daily":
      next.setDate(next.getDate() + 1);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "biweekly":
      next.setDate(next.getDate() + 14);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
  }
  return next;
}

export type RecurringRunResult = { jar: Jar; applied: number };

/**
 * Bring a jar's schedule up to date: apply every due recurring deposit and
 * advance nextDate past `now`. Bounded so a long-dormant schedule cannot loop
 * forever; at most 366 occurrences are applied per call.
 */
export function runDueRecurring(
  jar: Jar,
  now: Date = new Date(),
): RecurringRunResult {
  const rule = jar.recurring;
  if (!rule || rule.paused || !(rule.amount > 0)) return { jar, applied: 0 };

  let current = jar;
  let cursor = rule.nextDate
    ? new Date(rule.nextDate)
    : new Date(current.createdAt);
  // Never look back further than the jar existed plus one occurrence.
  const created = new Date(current.createdAt);
  if (cursor < created) cursor = created;

  let applied = 0;
  while (cursor.getTime() <= now.getTime() && applied < 366) {
    const result = applyEntry(
      current,
      rule.amount,
      "deposit",
      "Scheduled deposit",
      "recurring",
      cursor,
    );
    if (!result) break;
    current = result.jar;
    applied += 1;
    cursor = addCadence(cursor, rule.cadence);
  }

  if (applied === 0) return { jar, applied: 0 };

  const nextDate =
    cursor.getTime() > now.getTime()
      ? cursor.toISOString()
      : addCadence(cursor, rule.cadence).toISOString();
  return {
    jar: { ...current, recurring: { ...rule, nextDate } },
    applied,
  };
}

/**
 * What a recurring rule's next due date should become after an edit.
 *
 * A still-future due date survives unchanged terms: an amount-only edit must
 * not silently skip the deposit that was already due. A changed schedule
 * restarts from now (the catch-up writes whatever that skips), and anything
 * already due stays due.
 */
export function nextRecurringDate(params: {
  previous: Pick<RecurringRule, "amount" | "cadence" | "nextDate"> | undefined;
  amount: number;
  cadence: Cadence;
  now?: Date;
}): string | undefined {
  const { previous, amount, cadence } = params;
  const now = params.now ?? new Date();
  if (
    previous &&
    previous.amount === amount &&
    previous.cadence === cadence &&
    previous.nextDate &&
    new Date(previous.nextDate).getTime() > now.getTime()
  ) {
    return previous.nextDate;
  }
  return undefined;
}

/** Weekly pace of a recurring rule in minor units, rounded. Paused or empty rules pace zero. */
export function recurringPerWeek(rule: RecurringRule | undefined): number {
  if (!rule || rule.paused || !(rule.amount > 0)) return 0;
  switch (rule.cadence) {
    case "daily":
      return rule.amount * 7;
    case "weekly":
      return rule.amount;
    case "biweekly":
      return Math.round(rule.amount / 2);
    case "monthly":
      return Math.round((rule.amount * 12) / 52);
  }
}
