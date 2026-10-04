/**
 * Achievement badges for the Saving Jar domain.
 *
 * Every badge is earned from counters rolled up out of the jar list, so the
 * whole catalogue stays derivable — nothing is stored or mutated to earn one.
 */

import { type Jar } from "./jar";

/** Identity for an achievement badge. */
export type BadgeId =
  | "first-deposit"
  | "ten-deposits"
  | "fifty-deposits"
  | "hundred-deposits"
  | "streak-3"
  | "streak-7"
  | "streak-30"
  | "saved-100"
  | "saved-1000"
  | "first-goal"
  | "steady-months";

/** Everything badges are earned from — all derived from the jar list. */
export type BadgeStats = {
  /** Count of deposit entries across every jar. */
  deposits: number;
  /** Integer minor units deposited across every jar. */
  totalDeposited: number;
  /** Best habit streak on any jar. */
  maxStreak: number;
  /** Jars that reached 100%. */
  completed: number;
  /** Distinct calendar months with at least one deposit. */
  months: number;
};

export type Badge = {
  id: BadgeId;
  glyph: string;
  name: string;
  description: string;
  /** Current progress toward `target`, clamped for display. */
  value: number;
  /** Requirement that earns the badge. */
  target: number;
  earned: boolean;
};

/** The full badge catalogue, in display order. */
const BADGE_CATALOGUE: {
  id: BadgeId;
  glyph: string;
  name: string;
  description: string;
  of: (stats: BadgeStats) => [number, number];
}[] = [
  {
    id: "first-deposit",
    glyph: "🌱",
    name: "First Light",
    description: "Log your first deposit",
    of: (s) => [s.deposits, 1],
  },
  {
    id: "ten-deposits",
    glyph: "✨",
    name: "Getting Going",
    description: "Log 10 deposits",
    of: (s) => [s.deposits, 10],
  },
  {
    id: "fifty-deposits",
    glyph: "🧱",
    name: "Brick by Brick",
    description: "Log 50 deposits",
    of: (s) => [s.deposits, 50],
  },
  {
    id: "hundred-deposits",
    glyph: "🏛️",
    name: "Centurion",
    description: "Log 100 deposits",
    of: (s) => [s.deposits, 100],
  },
  {
    id: "streak-3",
    glyph: "🔥",
    name: "Three in a Row",
    description: "Reach a 3-day streak",
    of: (s) => [s.maxStreak, 3],
  },
  {
    id: "streak-7",
    glyph: "📅",
    name: "Week Strong",
    description: "Reach a 7-day streak",
    of: (s) => [s.maxStreak, 7],
  },
  {
    id: "streak-30",
    glyph: "🛡️",
    name: "Iron Jar",
    description: "Reach a 30-day streak",
    of: (s) => [s.maxStreak, 30],
  },
  {
    id: "saved-100",
    glyph: "💯",
    name: "First Hundred",
    description: "Save 100.00 in total",
    of: (s) => [s.totalDeposited, 10_000],
  },
  {
    id: "saved-1000",
    glyph: "🏔️",
    name: "Four Figures",
    description: "Save 1,000.00 in total",
    of: (s) => [s.totalDeposited, 100_000],
  },
  {
    id: "first-goal",
    glyph: "🎯",
    name: "Goal Smasher",
    description: "Complete a jar",
    of: (s) => [s.completed, 1],
  },
  {
    id: "steady-months",
    glyph: "🗓️",
    name: "Steady Hand",
    description: "Save in 4 different months",
    of: (s) => [s.months, 4],
  },
];

/** Roll a jar list up into the counters badges are earned from. */
export function badgeStats(
  jars: Pick<Jar, "archived" | "target" | "balance" | "streak" | "entries">[],
  now: Date = new Date(),
): BadgeStats {
  const months = new Set<string>();
  let deposits = 0;
  let totalDeposited = 0;
  let maxStreak = 0;
  let completed = 0;

  for (const jar of jars) {
    // As with the monthly chart, archived jars no longer count toward active
    // progress: unarchiving is the way back in.
    if (jar.archived) continue;
    for (const entry of jar.entries) {
      if (entry.direction !== "deposit") continue;
      deposits += 1;
      totalDeposited += entry.amount;
      const at = new Date(entry.at);
      if (!Number.isNaN(at.getTime())) {
        months.add(`${at.getFullYear()}-${at.getMonth()}`);
      }
    }
    maxStreak = Math.max(maxStreak, jar.streak ?? 0);
    if (jar.target > 0 && jar.balance >= jar.target) completed += 1;
  }

  return {
    deposits,
    totalDeposited,
    maxStreak,
    completed,
    months: months.size,
  };
}

/** Every badge with its live progress, earned flags included. `now` is accepted for symmetry and future time-boxed badges. */
export function badges(
  jars: Pick<Jar, "archived" | "target" | "balance" | "streak" | "entries">[],
  now: Date = new Date(),
): Badge[] {
  const stats = badgeStats(jars, now);
  return BADGE_CATALOGUE.map((badge) => {
    const [value, target] = badge.of(stats);
    return {
      id: badge.id,
      glyph: badge.glyph,
      name: badge.name,
      description: badge.description,
      value: Math.max(0, value),
      target,
      earned: value >= target,
    };
  });
}

/**
 * Badge ids present in `current` but absent from `previous` — the ones worth
 * celebrating. Pass the ids the user has already been shown as `previous`.
 */
export function newlyEarnedBadges(
  previous: Iterable<BadgeId>,
  current: Badge[],
): Badge[] {
  const known = new Set(previous);
  return current.filter((badge) => badge.earned && !known.has(badge.id));
}
