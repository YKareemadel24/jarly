/**
 * Jar types and the core state machine of the Saving Jar domain.
 *
 * Rules enforced here:
 * - Milestone levels are 25/50/75/100 and every crossed level is recorded.
 * - Habit streaks are calendar-day based, not deposit-count based.
 * - Jars are immutable values: every operation returns a new jar object.
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

/** Progress toward the target, 0–100 clamped. Zero when there is no target. */
export function percent(jar: Pick<Jar, "balance" | "target">): number {
  if (jar.target <= 0) return 0;
  return Math.min(100, Math.round((jar.balance / jar.target) * 100));
}

/**
 * Active jars only for every insight: archived jars live on as history, not
 * momentum. Centralises the filter so callers cannot forget it.
 */
export function activeJars<T extends Pick<Jar, "archived">>(jars: T[]): T[] {
  return jars.filter((jar) => !jar.archived);
}

/** All milestone levels newly crossed when balance moves to `nextBalance`. */
export function crossedMilestones(
  jar: Pick<Jar, "target" | "milestonesHit">,
  nextBalance: number,
): number[] {
  if (jar.target <= 0) return [];
  return MILESTONE_LEVELS.filter(
    (level) =>
      !jar.milestonesHit.includes(level) &&
      (nextBalance / jar.target) * 100 >= level,
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
export function depositDayKeys(
  entries: Pick<Entry, "at" | "direction">[],
): Set<string> {
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

  const nextBalance =
    jar.balance + (direction === "deposit" ? amountMinor : -amountMinor);
  const reached =
    direction === "deposit" ? crossedMilestones(jar, nextBalance) : [];

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
      milestonesHit: reached.length
        ? [...jar.milestonesHit, ...reached]
        : jar.milestonesHit,
      streak,
      lastDepositAt,
      entries: [entry, ...jar.entries],
    },
    reached,
  };
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

const accentAliases: Record<string, Accent> = {
  blue: "ocean",
  coral: "coral",
  amber: "amber",
  mint: "mint",
  ocean: "ocean",
  berry: "berry",
  clay: "clay",
};

type LegacyJar = Partial<Jar> & {
  id: string;
  name: string;
  target: number;
  balance: number;
  accent: string;
  icon: string;
};

/**
 * Normalise a persisted jar into the current shape. When `scaleToMinor` is set,
 * numeric money fields are converted from legacy whole-currency floats.
 */
export function normaliseJar(jar: LegacyJar, scaleToMinor = false): Jar {
  const scale = (value: number | undefined, fallback = 0) =>
    scaleToMinor ? Math.round((value ?? fallback) * 100) : (value ?? fallback);
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
