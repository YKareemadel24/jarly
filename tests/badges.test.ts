import { describe, expect, it, vi } from "vitest";

import { type BadgeId, badges, badgeStats, newlyEarnedBadges, type Jar } from "../lib/savings-core";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    multiGet: vi.fn(),
  },
}));

const jar = (overrides: Partial<Jar> = {}): Jar => ({
  id: "trip",
  name: "Japan trip",
  balance: 0,
  target: 10_000,
  accent: "ocean",
  icon: "flight",
  kind: "goal",
  createdAt: "2026-01-01T00:00:00.000Z",
  milestonesHit: [],
  entries: [],
  ...overrides,
});

const dep = (amount: number, at: string, id = `e-${amount}-${at}`) => ({
  id,
  amount,
  direction: "deposit" as const,
  source: "manual" as const,
  at,
});

const earnedIds = (list: ReturnType<typeof badges>) => list.filter((badge) => badge.earned).map((badge) => badge.id);
const find = (list: ReturnType<typeof badges>, id: BadgeId) => list.find((badge) => badge.id === id)!;

describe("badgeStats", () => {
  it("counts deposits and minor units across every jar", () => {
    const stats = badgeStats([
      jar({ entries: [dep(1000, "2026-03-01T00:00:00Z"), dep(2500, "2026-03-02T00:00:00Z")] }),
      jar({ id: "b", entries: [dep(500, "2026-04-01T00:00:00Z")] }),
    ]);
    expect(stats.deposits).toBe(3);
    expect(stats.totalDeposited).toBe(4000);
  });

  it("ignores withdrawals for counts, totals, and month coverage", () => {
    const stats = badgeStats([
      jar({
        entries: [
          dep(1000, "2026-03-01T00:00:00Z"),
          { id: "w1", amount: 400, direction: "withdrawal", source: "manual", at: "2026-05-01T00:00:00Z" },
        ],
      }),
    ]);
    expect(stats.deposits).toBe(1);
    expect(stats.totalDeposited).toBe(1000);
    expect(stats.months).toBe(1);
  });

  it("counts distinct calendar months, not deposits", () => {
    const stats = badgeStats([
      jar({
        entries: [
          dep(100, "2026-03-01T00:00:00Z"),
          dep(100, "2026-03-20T00:00:00Z"),
          dep(100, "2026-04-05T00:00:00Z"),
        ],
      }),
    ]);
    expect(stats.months).toBe(2);
  });

  it("takes the best streak across jars", () => {
    expect(badgeStats([jar({ streak: 3 }), jar({ id: "b", streak: 11 }), jar({ id: "c" })]).maxStreak).toBe(11);
  });

  it("counts only funded jars as completed", () => {
    const stats = badgeStats([
      jar({ balance: 10_000, target: 10_000 }),
      jar({ id: "b", balance: 9_999, target: 10_000 }),
      jar({ id: "c", balance: 0, target: 0 }),
    ]);
    expect(stats.completed).toBe(1);
  });

  it("counts a jar as shared only when it has more than one member", () => {
    const solo = jar({ members: [{ id: "1", name: "You", contributed: 100, you: true }] });
    const pair = jar({
      id: "b",
      members: [
        { id: "1", name: "You", contributed: 100, you: true },
        { id: "2", name: "Mia", contributed: 50 },
      ],
    });
    expect(badgeStats([solo, pair]).sharedJars).toBe(1);
  });

  it("tolerates an unparseable entry date without inflating months", () => {
    const stats = badgeStats([jar({ entries: [dep(500, "not-a-date")] })]);
    expect(stats.deposits).toBe(1);
    expect(stats.months).toBe(0);
  });

  it("returns zeroed stats for an empty list", () => {
    expect(badgeStats([])).toEqual({ deposits: 0, totalDeposited: 0, maxStreak: 0, completed: 0, months: 0, sharedJars: 0 });
  });
});

describe("badges", () => {
  it("returns the full catalogue in a stable order with progress", () => {
    const list = badges([jar()]);
    expect(list.length).toBe(12);
    expect(list.map((badge) => badge.id)).toEqual([
      "first-deposit",
      "ten-deposits",
      "fifty-deposits",
      "hundred-deposits",
      "streak-3",
      "streak-7",
      "streak-30",
      "saved-100",
      "saved-1000",
      "first-goal",
      "steady-months",
      "shared-jar",
    ]);
  });

  it("earns nothing for a brand-new jar", () => {
    expect(earnedIds(badges([jar()]))).toEqual([]);
    for (const badge of badges([jar()])) {
      expect(badge.earned).toBe(false);
      expect(badge.value).toBe(0);
    }
  });

  it("earns the first-deposit badge on a single contribution", () => {
    const list = badges([jar({ entries: [dep(1000, "2026-03-01T00:00:00Z")] })]);
    expect(find(list, "first-deposit").earned).toBe(true);
    expect(find(list, "ten-deposits").earned).toBe(false);
    expect(find(list, "ten-deposits").value).toBe(1);
  });

  it("earns money badges at the exact minor-unit threshold", () => {
    const under = badges([jar({ entries: [dep(9999, "2026-03-01T00:00:00Z")] })]);
    expect(find(under, "saved-100").earned).toBe(false);

    const exact = badges([jar({ entries: [dep(10_000, "2026-03-01T00:00:00Z")] })]);
    expect(find(exact, "saved-100").earned).toBe(true);
    expect(find(exact, "saved-1000").earned).toBe(false);
  });

  it("earns streak badges from the best streak", () => {
    const list = badges([jar({ kind: "habit", streak: 7 })]);
    expect(earnedIds(list)).toEqual(expect.arrayContaining(["streak-3", "streak-7"]));
    expect(find(list, "streak-30").earned).toBe(false);
    expect(find(list, "streak-30").value).toBe(7);
  });

  it("earns the completion badge only when a jar is fully funded", () => {
    expect(find(badges([jar({ balance: 9999, target: 10_000 })]), "first-goal").earned).toBe(false);
    expect(find(badges([jar({ balance: 10_000, target: 10_000 })]), "first-goal").earned).toBe(true);
  });

  it("earns the months badge at four distinct months", () => {
    const three = badges([jar({ entries: [dep(1, "2026-01-01T00:00:00Z"), dep(1, "2026-02-01T00:00:00Z"), dep(1, "2026-03-01T00:00:00Z")] })]);
    expect(find(three, "steady-months").earned).toBe(false);
    expect(find(three, "steady-months").value).toBe(3);

    const four = badges([jar({ entries: [dep(1, "2026-01-01T00:00:00Z"), dep(1, "2026-02-01T00:00:00Z"), dep(1, "2026-03-01T00:00:00Z"), dep(1, "2026-04-01T00:00:00Z")] })]);
    expect(find(four, "steady-months").earned).toBe(true);
  });

  it("earns the shared-jar badge once a jar has two members", () => {
    const shared = jar({
      members: [
        { id: "1", name: "You", contributed: 100, you: true },
        { id: "2", name: "Mia", contributed: 0 },
      ],
    });
    expect(find(badges([shared]), "shared-jar").earned).toBe(true);
  });

  it("never reports negative progress", () => {
    for (const badge of badges([jar({ streak: 0, entries: [] })])) {
      expect(badge.value).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("newlyEarnedBadges", () => {
  it("returns only badges absent from the seen list", () => {
    const list = badges([jar({ entries: [dep(10_000, "2026-03-01T00:00:00Z")] })]);
    const fresh = newlyEarnedBadges([], list).map((badge) => badge.id);
    expect(fresh).toEqual(expect.arrayContaining(["first-deposit", "saved-100"]));

    const seen: BadgeId[] = ["first-deposit", "saved-100"];
    expect(newlyEarnedBadges(seen, list)).toEqual([]);
  });

  it("never reports an unearned badge", () => {
    const list = badges([jar()]);
    expect(newlyEarnedBadges([], list)).toEqual([]);
  });
});