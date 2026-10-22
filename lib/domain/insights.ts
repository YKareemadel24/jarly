/**
 * Derived insights for the Saving Jar domain.
 *
 * Everything here is pure: it takes jar data (and an injectable clock) and
 * returns data — callers format the words. Integer minor units throughout.
 */

import { effectiveEntries, type Jar, MILESTONE_LEVELS } from "./jar";
import { recurringPerWeek } from "./schedule";

export type MonthTotal = { label: string; total: number };

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const DAY_MS = 86_400_000;

function calendarDay(date: Date): number {
  const day = new Date(0);
  day.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  return day.getTime() / DAY_MS;
}

/** Deposit totals per calendar month for the last `count` months, oldest first. */
export function monthlyDeposits(
  jars: Pick<Jar, "archived" | "entries">[],
  now: Date = new Date(),
  count = 6,
): MonthTotal[] {
  const buckets: MonthTotal[] = [];
  for (let i = count - 1; i >= 0; i--) {
    buckets.push({
      label:
        MONTH_LABELS[
          new Date(now.getFullYear(), now.getMonth() - i, 1).getMonth()
        ],
      total: 0,
    });
  }
  for (const jar of jars) {
    // Archived jars are their own history section on the profile screen; the
    // insights chart reports on active saving only.
    if (jar.archived) continue;
    for (const entry of effectiveEntries(jar.entries)) {
      if (entry.direction !== "deposit") continue;
      const at = new Date(entry.at);
      const ago =
        (now.getFullYear() - at.getFullYear()) * 12 +
        (now.getMonth() - at.getMonth());
      if (ago >= 0 && ago < buckets.length)
        buckets[buckets.length - 1 - ago].total += entry.amount;
    }
  }
  return buckets;
}

/** Parse an ISO or "Month Year" (end of that month) deadline. Undefined when unparseable. */
export function parseDeadline(deadline: string): Date | undefined {
  const value = deadline.trim();
  const monthYear = /^([A-Za-z]+)\s+(\d{4})$/.exec(value);
  const month = monthYear
    ? MONTH_NAMES.indexOf(monthYear[1].toLowerCase())
    : -1;
  if (monthYear && month >= 0) {
    const endOfMonth = new Date(0);
    endOfMonth.setFullYear(Number(monthYear[2]), month + 1, 0);
    endOfMonth.setHours(0, 0, 0, 0);
    return Number.isNaN(endOfMonth.getTime()) ? undefined : endOfMonth;
  }

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const [, year, monthNumber, dayNumber] = dateOnly;
    const localDate = new Date(0);
    localDate.setFullYear(
      Number(year),
      Number(monthNumber) - 1,
      Number(dayNumber),
    );
    localDate.setHours(0, 0, 0, 0);
    if (
      localDate.getFullYear() === Number(year) &&
      localDate.getMonth() === Number(monthNumber) - 1 &&
      localDate.getDate() === Number(dayNumber)
    )
      return localDate;
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Human deadline chip. Returns a countdown ("12 days left") when the deadline
 * is parseable (ISO or "December 2026"), the original text otherwise.
 * Never relies on color alone — callers pair this with an icon.
 */
export function deadlineCountdown(
  deadline: string | undefined,
  now: Date = new Date(),
): string | undefined {
  if (!deadline) return undefined;
  const date = parseDeadline(deadline);
  if (!date) return deadline;
  const days = calendarDay(date) - calendarDay(now);
  if (days < 0) return "Past deadline";
  if (days === 0) return "Due today";
  if (days === 1) return "1 day left";
  if (days <= 45) return `${days} days left`;
  return deadline;
}

/** Deadlines within two weeks read as urgent; meaning stays textual either way. */
export function isUrgentDeadline(text: string | undefined): boolean {
  if (!text) return false;
  return /^(Due today|Past deadline|([1-9]|1[0-4]) days left)$/.test(text);
}

/** Smallest next-milestone money gap across jars, for the nudge row. */
export function nextMilestoneNudge<T extends Pick<Jar, "target" | "balance">>(
  jars: T[],
): { jar: T; level: number; gapMinor: number } | undefined {
  let best: { jar: T; level: number; gapMinor: number } | undefined;
  for (const jar of jars) {
    if (jar.target <= 0) continue;
    const ratio = (jar.balance / jar.target) * 100;
    const level = MILESTONE_LEVELS.find((candidate) => ratio < candidate);
    if (!level) continue;
    const gapMinor = Math.round((jar.target * level) / 100) - jar.balance;
    if (gapMinor <= 0) continue;
    if (!best || gapMinor < best.gapMinor) best = { jar, level, gapMinor };
  }
  return best;
}

/** Deposit minor units across jars within the trailing `windowMs` ending at `now`. */
export function depositTotalWithin(
  jars: Pick<Jar, "entries">[],
  windowMs: number,
  now: Date = new Date(),
): number {
  const since = now.getTime() - windowMs;
  let total = 0;
  for (const jar of jars) {
    for (const entry of effectiveEntries(jar.entries)) {
      if (entry.direction !== "deposit") continue;
      const at = new Date(entry.at).getTime();
      if (at >= since && at <= now.getTime()) total += entry.amount;
    }
  }
  return total;
}

const WEEK_MS = 7 * 86_400_000;

/** Total deposits made across jars during the trailing seven days. */
export function weeklyDelta(
  jars: Pick<Jar, "entries">[],
  now: Date = new Date(),
): number {
  return depositTotalWithin(jars, WEEK_MS, now);
}

export type PaceStatus =
  | "funded"
  | "no-deadline"
  | "no-pace"
  | "on-track"
  | "behind";

export type PaceProjection = {
  status: PaceStatus;
  /** Minor units needed per week to hit the deadline. Zero when funded or dateless. */
  requiredPerWeekMinor: number;
  /** Minor units per week of effective pace (best of recent deposits, recurring schedule). */
  pacePerWeekMinor: number;
  /** ISO timestamp of the projected finish at current pace. Present for on-track/behind. */
  projectedDate?: string;
};

/**
 * Coach verdict for a dated jar: required-per-week vs. effective pace, where
 * pace is the best of trailing-28-day deposits and the recurring schedule.
 * Pure and integer-minor throughout; returns data, callers format the words.
 */
export function paceProjection(
  jar: Pick<Jar, "target" | "balance" | "deadline" | "entries" | "recurring">,
  now: Date = new Date(),
): PaceProjection {
  const remaining = jar.target - jar.balance;
  if (remaining <= 0)
    return { status: "funded", requiredPerWeekMinor: 0, pacePerWeekMinor: 0 };
  if (!jar.deadline)
    return {
      status: "no-deadline",
      requiredPerWeekMinor: 0,
      pacePerWeekMinor: 0,
    };
  const date = parseDeadline(jar.deadline);
  if (!date)
    return {
      status: "no-deadline",
      requiredPerWeekMinor: 0,
      pacePerWeekMinor: 0,
    };

  const daysLeft = BigInt(Math.max(7, calendarDay(date) - calendarDay(now)));
  const requiredPerWeekMinor = Number(
    (BigInt(remaining) * 7n + daysLeft - 1n) / daysLeft,
  );

  const cutoff = now.getTime() - 28 * 86_400_000;
  let recent = 0;
  for (const entry of effectiveEntries(jar.entries)) {
    if (entry.direction !== "deposit") continue;
    const at = new Date(entry.at).getTime();
    if (at >= cutoff && at <= now.getTime()) recent += entry.amount;
  }
  const pacePerWeekMinor = Math.max(
    Math.round(recent / 4),
    recurringPerWeek(jar.recurring),
  );
  if (pacePerWeekMinor <= 0)
    return { status: "no-pace", requiredPerWeekMinor, pacePerWeekMinor: 0 };

  const projected = new Date(
    now.getTime() + (remaining / pacePerWeekMinor) * WEEK_MS,
  );
  if (!Number.isFinite(projected.getTime()))
    return { status: "behind", requiredPerWeekMinor, pacePerWeekMinor };
  const projectedDate = projected.toISOString();
  // Day granularity: finishing on the deadline day itself counts as on-track,
  // so intraday clock time never flips the verdict.
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return {
    status:
      startOfDay(new Date(projectedDate)) <= startOfDay(date)
        ? "on-track"
        : "behind",
    requiredPerWeekMinor,
    pacePerWeekMinor,
    projectedDate,
  };
}
