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

export type EntryRevision = {
  amount: number;
  at: string;
  note?: string;
  changedAt: string;
};

export type JarReminder = {
  enabled: boolean;
  hour: number;
  minute: number;
  weekdays: number[];
  snoozedUntil?: string;
};

export type Entry = {
  id: string;
  /** Integer minor units. Always positive; direction carries the sign. */
  amount: number;
  direction: "deposit" | "withdrawal";
  note?: string;
  at: string;
  source?: "manual" | "recurring";
  revisions?: EntryRevision[];
  /** The entry reversed by this compensating transaction. */
  undoOf?: string;
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
  /** Legacy savings recorded before a transaction ledger existed. */
  openingBalance?: number;
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
  reminder?: JarReminder;
  entries: Entry[];
};

export const MILESTONE_LEVELS = [25, 50, 75, 100] as const;

export const CADENCES: Cadence[] = ["daily", "weekly", "biweekly", "monthly"];

/** Real contributions, excluding both sides of an Undo while retaining the full ledger. */
export function effectiveEntries<T extends Pick<Entry, "id" | "undoOf">>(
  entries: T[],
): T[] {
  const reversed = new Set(
    entries.flatMap((entry) => (entry.undoOf ? [entry.undoOf] : [])),
  );
  return entries.filter((entry) => !entry.undoOf && !reversed.has(entry.id));
}

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
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return null;
  if (!Number.isSafeInteger(jar.balance) || jar.balance < 0) return null;
  if (direction === "withdrawal" && amountMinor > jar.balance) return null;

  const nextBalance =
    jar.balance + (direction === "deposit" ? amountMinor : -amountMinor);
  if (!Number.isSafeInteger(nextBalance) || nextBalance < 0) return null;
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
  const entries = (Array.isArray(jar.entries) ? jar.entries : []).map(
    (entry) => ({ ...entry, amount: scale(entry.amount) }),
  );
  const balance = scale(jar.balance);
  let openingBalance =
    jar.openingBalance === undefined ? undefined : scale(jar.openingBalance);
  if (
    openingBalance === undefined &&
    Number.isSafeInteger(balance) &&
    entries.every((entry) => Number.isSafeInteger(entry.amount))
  ) {
    const opening = entries.reduce(
      (total, entry) =>
        total -
        BigInt(entry.amount) * (entry.direction === "deposit" ? 1n : -1n),
      BigInt(balance),
    );
    if (opening >= 0n && opening <= BigInt(Number.MAX_SAFE_INTEGER))
      openingBalance = Number(opening);
  }
  return {
    ...jar,
    accent: accentAliases[jar.accent] ?? "ocean",
    kind: jar.kind ?? (scaledRecurring ? "habit" : "goal"),
    createdAt: jar.createdAt ?? new Date().toISOString(),
    target: scale(jar.target),
    balance,
    openingBalance,
    recurring: scaledRecurring,
    milestonesHit: Array.isArray(jar.milestonesHit) ? jar.milestonesHit : [],
    entries,
  } as Jar;
}
