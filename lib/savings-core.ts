/**
 * Pure Saving Jar domain layer.
 *
 * Rules enforced here:
 * - Money is ALWAYS an integer number of minor units (cents). Never floats.
 * - Milestone levels are 25/50/75/100 and every crossed level is recorded.
 * - Habit streaks are calendar-day based, not deposit-count based.
 * - Recurring rules have a computable nextDate and can be caught up deterministically.
 */

export type Accent = "coral" | "amber" | "mint" | "ocean" | "berry" | "clay";
export type Cadence = "daily" | "weekly" | "biweekly" | "monthly";
export type JarKind = "goal" | "habit";

export type Entry = {
  id: string;
  /** Integer minor units. Always positive; direction carries the sign. */
  amount: number;
  direction: "deposit" | "withdrawal";
  note?: string;
  at: string;
  source?: "manual" | "recurring";
};

export type RecurringRule = {
  /** Integer minor units. */
  amount: number;
  cadence: Cadence;
  paused: boolean;
  /** ISO timestamp of the next scheduled occurrence. */
  nextDate?: string;
};

export type Jar = {
  id: string;
  name: string;
  /** Integer minor units. */
  target: number;
  /** Integer minor units. */
  balance: number;
  accent: Accent;
  icon: string;
  kind: JarKind;
  createdAt: string;
  deadline?: string;
  streak?: number;
  lastDepositAt?: string;
  milestonesHit: number[];
  archived?: boolean;
  recurring?: RecurringRule;
  entries: Entry[];
};

export const MILESTONE_LEVELS = [25, 50, 75, 100] as const;

export const CADENCES: Cadence[] = ["daily", "weekly", "biweekly", "monthly"];

export function toMinor(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function fromMinor(minor: number): number {
  return minor / 100;
}

export function money(minor: number, currency: string = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(fromMinor(minor));
  } catch {
    return `${currency} ${fromMinor(minor).toFixed(2)}`;
  }
}

export function percent(jar: Pick<Jar, "balance" | "target">): number {
  if (jar.target <= 0) return 0;
  return Math.min(100, Math.round((jar.balance / jar.target) * 100));
}

export type MonthTotal = { label: string; total: number };

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Deposit totals per calendar month for the last `count` months, oldest first. */
export function monthlyDeposits(jars: Pick<Jar, "entries">[], now: Date = new Date(), count = 6): MonthTotal[] {
  const buckets: MonthTotal[] = [];
  for (let i = count - 1; i >= 0; i--) {
    buckets.push({ label: MONTH_LABELS[new Date(now.getFullYear(), now.getMonth() - i, 1).getMonth()], total: 0 });
  }
  for (const jar of jars) {
    for (const entry of jar.entries) {
      if (entry.direction !== "deposit") continue;
      const at = new Date(entry.at);
      const ago = (now.getFullYear() - at.getFullYear()) * 12 + (now.getMonth() - at.getMonth());
      if (ago >= 0 && ago < buckets.length) buckets[buckets.length - 1 - ago].total += entry.amount;
    }
  }
  return buckets;
}

const DAY_MS = 86_400_000;

function localDayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
}

/** Deposit totals for consecutive local calendar days ending today, oldest first. */
export function dailyDepositTotals(jars: Pick<Jar, "entries">[], days: number, now: Date = new Date()): number[] {
  const totals = new Array(Math.max(0, days)).fill(0);
  const today = localDayNumber(now);
  for (const jar of jars) {
    for (const entry of jar.entries) {
      if (entry.direction !== "deposit") continue;
      const index = totals.length - 1 - (today - localDayNumber(new Date(entry.at)));
      if (index >= 0 && index < totals.length) totals[index] += entry.amount;
    }
  }
  return totals;
}

/** Deposit totals for consecutive seven-day blocks ending today, oldest first. */
export function weeklyDepositTotals(jars: Pick<Jar, "entries">[], weeks: number, now: Date = new Date()): number[] {
  const daily = dailyDepositTotals(jars, Math.max(0, weeks) * 7, now);
  return Array.from({ length: Math.max(0, weeks) }, (_, index) =>
    daily.slice(index * 7, index * 7 + 7).reduce((sum, amount) => sum + amount, 0),
  );
}

export type DepositPreset = {
  kind: "usual" | "weekly-pace" | "milestone" | "finish";
  amount: number;
  level?: number;
};

/** Goal-aware deposit choices, ordered by the user's established habit then useful outcomes. */
export function depositPresets(jar: Pick<Jar, "balance" | "target" | "entries">, pace: PaceProjection): DepositPreset[] {
  const remaining = Math.max(0, jar.target - jar.balance);
  if (!remaining) return [];

  const choices: DepositPreset[] = [];
  const usual = jar.entries.find((entry) => entry.direction === "deposit")?.amount;
  if (usual && usual > 0) choices.push({ kind: "usual", amount: usual });
  if (pace.requiredPerWeekMinor > 0) choices.push({ kind: "weekly-pace", amount: pace.requiredPerWeekMinor });

  const level = MILESTONE_LEVELS.find((candidate) => jar.balance < Math.ceil((jar.target * candidate) / 100));
  if (level && level < 100) {
    const amount = Math.ceil((jar.target * level) / 100) - jar.balance;
    if (amount > 0) choices.push({ kind: "milestone", amount, level });
  }
  choices.push({ kind: "finish", amount: remaining });

  return choices.filter((choice, index) =>
    choice.amount > 0 && choices.findIndex((other) => other.amount === choice.amount) === index,
  ).slice(0, 4);
}

export type EntryGroup = { label: string; entries: Entry[] };

/** Group newest-first entries into concise, local-time activity sections. */
export function groupEntriesByPeriod(entries: Entry[], now: Date = new Date()): EntryGroup[] {
  const today = localDayNumber(now);
  const groups: EntryGroup[] = [];
  for (const entry of entries) {
    const daysAgo = today - localDayNumber(new Date(entry.at));
    const label = daysAgo <= 0 ? "Today" : daysAgo === 1 ? "Yesterday" : daysAgo < 7 ? "This week" : daysAgo < 31
      ? "This month"
      : new Date(entry.at).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const last = groups.at(-1);
    if (last?.label === label) last.entries.push(entry);
    else groups.push({ label, entries: [entry] });
  }
  return groups;
}

/** The jar that deserves the single Home call to action, if any. */
export function nextBestJarId(jars: Pick<Jar, "id" | "target" | "balance" | "deadline" | "entries" | "recurring" | "archived">[], now: Date = new Date()): string | undefined {
  const active = jars.filter((jar) => !jar.archived && percent(jar) < 100);
  const behind = active.find((jar) => paceProjection(jar, now).status === "behind");
  return (behind ?? active.sort((left, right) => percent(right) - percent(left))[0])?.id;
}

/** Required daily and weekly contributions for a month-based jar timeline. */
export function savingRate(targetMinor: number, months: number): { perWeekMinor: number; perDayMinor: number } {
  const days = Math.max(1, Math.round(months) * 30);
  const target = Math.max(0, Math.round(targetMinor));
  return { perWeekMinor: Math.ceil((target * 7) / days), perDayMinor: Math.ceil(target / days) };
}

/** All milestone levels newly crossed when balance moves to `nextBalance`. */
export function crossedMilestones(jar: Pick<Jar, "target" | "milestonesHit">, nextBalance: number): number[] {
  if (jar.target <= 0) return [];
  return MILESTONE_LEVELS.filter(
    (level) => !jar.milestonesHit.includes(level) && (nextBalance / jar.target) * 100 >= level,
  );
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function previousDayKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m, d - 1);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Local-day keys with at least one deposit — backing for the habit rhythm view. */
export function depositDayKeys(entries: Pick<Entry, "at" | "direction">[]): Set<string> {
  const keys = new Set<string>();
  for (const entry of entries) {
    if (entry.direction !== "deposit") continue;
    keys.add(dayKey(entry.at));
  }
  return keys;
}

/** Result of applying a single entry to a jar. */
export type AppliedEntry = { jar: Jar; reached: number[] };

/**
 * Apply a deposit or withdrawal. Returns null when the operation is invalid
 * (unknown jar state, non-positive amount, withdrawal above balance).
 */
export function applyEntry(
  jar: Jar,
  amountMinor: number,
  direction: Entry["direction"],
  note?: string,
  source: Entry["source"] = "manual",
  now: Date = new Date(),
): AppliedEntry | null {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) return null;
  if (direction === "withdrawal" && amountMinor > jar.balance) return null;

  const nextBalance = jar.balance + (direction === "deposit" ? amountMinor : -amountMinor);
  const reached = direction === "deposit" ? crossedMilestones(jar, nextBalance) : [];

  let streak = jar.streak;
  let lastDepositAt = jar.lastDepositAt;
  if (direction === "deposit" && jar.kind === "habit") {
    const today = dayKey(now.toISOString());
    const yesterday = previousDayKey(today);
    const last = lastDepositAt ? dayKey(lastDepositAt) : undefined;
    if (last !== today) {
      streak = last === yesterday ? (streak ?? 0) + 1 : 1;
    }
    lastDepositAt = now.toISOString();
  }

  const entry: Entry = {
    id: `entry-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    amount: amountMinor,
    direction,
    note,
    at: now.toISOString(),
    source,
  };

  return {
    jar: {
      ...jar,
      balance: nextBalance,
      milestonesHit: reached.length ? [...jar.milestonesHit, ...reached] : jar.milestonesHit,
      streak,
      lastDepositAt,
      entries: [entry, ...jar.entries],
    },
    reached,
  };
}

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
export function runDueRecurring(jar: Jar, now: Date = new Date()): RecurringRunResult {
  const rule = jar.recurring;
  if (!rule || rule.paused || !(rule.amount > 0)) return { jar, applied: 0 };

  let current = jar;
  let cursor = rule.nextDate ? new Date(rule.nextDate) : new Date(current.createdAt);
  // Never look back further than the jar existed plus one occurrence.
  const created = new Date(current.createdAt);
  if (cursor < created) cursor = created;

  let applied = 0;
  while (cursor.getTime() <= now.getTime() && applied < 366) {
    const result = applyEntry(current, rule.amount, "deposit", "Scheduled deposit", "recurring", cursor);
    if (!result) break;
    current = result.jar;
    applied += 1;
    cursor = addCadence(cursor, rule.cadence);
  }

  if (applied === 0) return { jar, applied: 0 };

  const nextDate = cursor.getTime() > now.getTime() ? cursor.toISOString() : addCadence(cursor, rule.cadence).toISOString();
  return {
    jar: { ...current, recurring: { ...rule, nextDate } },
    applied,
  };
}

/** Keep only digits and a single decimal separator, max two fraction digits. */
export function sanitizeAmountInput(raw: string): string {
  let cleaned = "";
  let seenDot = false;
  let fraction = 0;
  for (const char of raw.replace(",", ".")) {
    if (char >= "0" && char <= "9") {
      if (seenDot) {
        if (fraction >= 2) continue;
        fraction += 1;
      }
      cleaned += char;
    } else if (char === "." && !seenDot) {
      seenDot = true;
      cleaned += char;
    }
  }
  return cleaned;
}

export const jarAccent: Record<Accent, string> = {
  coral: "#D97963",
  amber: "#D9A93E",
  mint: "#63AD91",
  ocean: "#6D9CB2",
  berry: "#A96B97",
  clay: "#AF7D5C",
};

/** Brighter dark-theme variants so alpha-tinted accents stay legible on #2D2722 surfaces. */
export const jarAccentDark: Record<Accent, string> = {
  coral: "#E8917C",
  amber: "#E8BE5F",
  mint: "#7FC4A8",
  ocean: "#85B4C9",
  berry: "#C08BB2",
  clay: "#C79A78",
};

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** Parse an ISO or "Month Year" (end of that month) deadline. Undefined when unparseable. */
export function parseDeadline(deadline: string): Date | undefined {
  const date = new Date(deadline);
  if (!Number.isNaN(date.getTime())) return date;
  const match = /^([A-Za-z]+)\s+(\d{4})$/.exec(deadline.trim());
  const month = match ? MONTH_NAMES.indexOf(match[1].toLowerCase()) : -1;
  if (month < 0 || !match) return undefined;
  const endOfMonth = new Date(Number(match[2]), month + 1, 0);
  return Number.isNaN(endOfMonth.getTime()) ? undefined : endOfMonth;
}

/**
 * Human deadline chip. Returns a countdown ("12 days left") when the deadline
 * is parseable (ISO or "December 2026"), the original text otherwise.
 * Never relies on color alone — callers pair this with an icon.
 */
export function deadlineCountdown(deadline: string | undefined, now: Date = new Date()): string | undefined {
  if (!deadline) return undefined;
  const date = parseDeadline(deadline);
  if (!date) return deadline;
  const days = Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return "Past deadline";
  if (days === 0) return "Due today";
  if (days === 1) return "1 day left";
  if (days <= 45) return `${days} days left`;
  return deadline;
}

const WEEK_MS = 7 * 86_400_000;

/** Weekly pace of a recurring rule in minor units, rounded. Paused or empty rules pace zero. */
function recurringPerWeek(rule: RecurringRule | undefined): number {
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

export type PaceStatus = "funded" | "no-deadline" | "no-pace" | "on-track" | "behind";

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
  if (remaining <= 0) return { status: "funded", requiredPerWeekMinor: 0, pacePerWeekMinor: 0 };
  if (!jar.deadline) return { status: "no-deadline", requiredPerWeekMinor: 0, pacePerWeekMinor: 0 };
  const date = parseDeadline(jar.deadline);
  if (!date) return { status: "no-deadline", requiredPerWeekMinor: 0, pacePerWeekMinor: 0 };

  const weeksLeft = Math.max(1, Math.ceil((date.getTime() - now.getTime()) / WEEK_MS));
  const requiredPerWeekMinor = Math.ceil(remaining / weeksLeft);

  const cutoff = now.getTime() - 28 * 86_400_000;
  let recent = 0;
  for (const entry of jar.entries) {
    if (entry.direction !== "deposit") continue;
    const at = new Date(entry.at).getTime();
    if (at >= cutoff && at <= now.getTime()) recent += entry.amount;
  }
  const pacePerWeekMinor = Math.max(Math.round(recent / 4), recurringPerWeek(jar.recurring));
  if (pacePerWeekMinor <= 0) return { status: "no-pace", requiredPerWeekMinor, pacePerWeekMinor: 0 };

  const projectedDate = new Date(now.getTime() + (remaining / pacePerWeekMinor) * WEEK_MS).toISOString();
  // Day granularity: finishing on the deadline day itself counts as on-track,
  // so intraday clock time never flips the verdict.
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return {
    status: startOfDay(new Date(projectedDate)) <= startOfDay(date) ? "on-track" : "behind",
    requiredPerWeekMinor,
    pacePerWeekMinor,
    projectedDate,
  };
}

const accentAliases: Record<string, Accent> = {
  blue: "ocean",
  coral: "coral",
  amber: "amber",
  mint: "mint",
  ocean: "ocean",
  berry: "berry",
  clay: "clay",
};

type LegacyJar = Partial<Jar> & { id: string; name: string; target: number; balance: number; accent: string; icon: string };

/**
 * Normalise a persisted jar into the current shape. When `scaleToMinor` is set,
 * numeric money fields are converted from legacy whole-currency floats.
 */
export function normaliseJar(jar: LegacyJar, scaleToMinor = false): Jar {
  const scale = (value: number | undefined, fallback = 0) =>
    scaleToMinor ? Math.round((value ?? fallback) * 100) : value ?? fallback;
  const scaledRecurring =
    jar.recurring && typeof jar.recurring === "object"
      ? { ...jar.recurring, amount: scale(jar.recurring.amount) }
      : undefined;
  return {
    ...jar,
    accent: accentAliases[jar.accent] ?? "ocean",
    kind: jar.kind ?? (scaledRecurring ? "habit" : "goal"),
    createdAt: jar.createdAt ?? new Date().toISOString(),
    target: scale(jar.target),
    balance: scale(jar.balance),
    recurring: scaledRecurring,
    milestonesHit: Array.isArray(jar.milestonesHit) ? jar.milestonesHit : [],
    entries: (Array.isArray(jar.entries) ? jar.entries : []).map((entry) => ({
      ...entry,
      amount: scale(entry.amount),
    })),
  } as Jar;
}
