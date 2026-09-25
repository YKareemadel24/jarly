import { describe, expect, it, vi } from "vitest";

import {
  applyEntry,
  activeJars,
  badgeStats,
  crossedMilestones,
  deadlineCountdown,
  type Jar,
  money,
  monthlyDeposits,
  nextRecurringDate,
  runDueRecurring,
  sanitizeAmountInput,
  toMinor,
  weeklyDelta,
} from "../lib/savings-core";

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
  target: 10000,
  accent: "ocean",
  icon: "flight",
  kind: "goal",
  createdAt: "2026-01-01T00:00:00.000Z",
  milestonesHit: [],
  entries: [],
  ...overrides,
});

describe("money", () => {
  it("converts dollars to integer minor units", () => {
    expect(toMinor(25.5)).toBe(2550);
    expect(money(2550)).toContain("25.50");
  });

  it("rejects non-finite input", () => {
    expect(toMinor("abc")).toBeNull();
    expect(toMinor(Number.NaN)).toBeNull();
  });
});

describe("sanitizeAmountInput", () => {
  it("strips non-numeric characters and extra separators", () => {
    expect(sanitizeAmountInput("-12a3.4.5.6")).toBe("123.45");
    expect(sanitizeAmountInput("abc")).toBe("");
    expect(sanitizeAmountInput("1,2")).toBe("1.2");
  });
});

describe("crossedMilestones", () => {
  it("records every level crossed in one jump", () => {
    const base = jar({ milestonesHit: [25] });
    // 30 -> 80 of a 100.00 target crosses 50 and 75.
    expect(crossedMilestones(base, 8000)).toEqual([50, 75]);
  });

  it("skips already-hit levels", () => {
    // 80 of a 100.00 target: 75 is newly crossed, 25/50 were already recorded.
    expect(crossedMilestones(jar({ milestonesHit: [25, 50] }), 8000)).toEqual([
      75,
    ]);
    expect(crossedMilestones(jar(), 2000)).toEqual([]);
  });

  it("never divides by a zero target", () => {
    expect(crossedMilestones(jar({ target: 0 }), 5000)).toEqual([]);
  });
});

describe("applyEntry", () => {
  it("rejects withdrawals above the balance without mutating state", () => {
    const base = jar({ balance: 5000 });
    expect(applyEntry(base, 5001, "withdrawal")).toBeNull();
  });

  it("applies a valid withdrawal and never touches milestones or streaks", () => {
    const base = jar({ balance: 5000, kind: "habit", streak: 4 });
    const result = applyEntry(base, 2000, "withdrawal");
    expect(result?.jar.balance).toBe(3000);
    expect(result?.reached).toEqual([]);
    expect(result?.jar.streak).toBe(4);
    expect(result?.jar.entries[0]?.direction).toBe("withdrawal");
  });

  it("rejects zero and negative amounts", () => {
    expect(applyEntry(jar(), 0, "deposit")).toBeNull();
    expect(applyEntry(jar(), -100, "deposit")).toBeNull();
  });

  it("counts one milestone per deposit but records all crossed levels over time", () => {
    let current = jar();
    const first = applyEntry(current, 2500, "deposit");
    expect(first?.reached).toEqual([25]);
    current = first!.jar;
    const second = applyEntry(current, 5500, "deposit");
    expect(second?.reached).toEqual([50, 75]);
    expect(second!.jar.milestonesHit).toEqual([25, 50, 75]);
  });
});

describe("habit streaks", () => {
  const day = (iso: string) => new Date(iso);

  it("starts at 1 on the first deposit", () => {
    const result = applyEntry(
      jar({ kind: "habit" }),
      1000,
      "deposit",
      undefined,
      "manual",
      day("2026-03-10T10:00:00Z"),
    );
    expect(result?.jar.streak).toBe(1);
  });

  it("does not grow within the same day", () => {
    const base = jar({
      kind: "habit",
      streak: 3,
      lastDepositAt: "2026-03-10T08:00:00Z",
    });
    const result = applyEntry(
      base,
      1000,
      "deposit",
      undefined,
      "manual",
      day("2026-03-10T20:00:00Z"),
    );
    expect(result?.jar.streak).toBe(3);
  });

  it("grows on consecutive days and resets after a gap", () => {
    const yesterday = jar({
      kind: "habit",
      streak: 3,
      lastDepositAt: "2026-03-09T20:00:00Z",
    });
    expect(
      applyEntry(
        yesterday,
        1000,
        "deposit",
        undefined,
        "manual",
        day("2026-03-10T09:00:00Z"),
      )?.jar.streak,
    ).toBe(4);

    const stale = jar({
      kind: "habit",
      streak: 9,
      lastDepositAt: "2026-03-01T20:00:00Z",
    });
    expect(
      applyEntry(
        stale,
        1000,
        "deposit",
        undefined,
        "manual",
        day("2026-03-10T09:00:00Z"),
      )?.jar.streak,
    ).toBe(1);
  });

  it("ignores goal jars entirely", () => {
    const result = applyEntry(
      jar({ kind: "goal", streak: 2 }),
      1000,
      "deposit",
      undefined,
      "manual",
      day("2026-03-10T10:00:00Z"),
    );
    expect(result?.jar.streak).toBe(2);
    expect(result?.jar.lastDepositAt).toBeUndefined();
  });
});

describe("runDueRecurring", () => {
  it("applies each missed occurrence once and advances nextDate past now", () => {
    const weekly = jar({
      createdAt: "2026-06-01T00:00:00.000Z",
      recurring: { amount: 500, cadence: "weekly", paused: false },
    });
    const now = new Date("2026-06-16T00:00:00.000Z");
    const result = runDueRecurring(weekly, now);
    // Due on Jun 1, 8, 15 -> three deposits; next due Jun 22.
    expect(result.applied).toBe(3);
    expect(result.jar.balance).toBe(1500);
    expect(new Date(result.jar.recurring?.nextDate ?? "").toISOString()).toBe(
      "2026-06-22T00:00:00.000Z",
    );
    expect(
      result.jar.entries.filter((entry) => entry.source === "recurring"),
    ).toHaveLength(3);
  });

  it("does nothing when paused or when nothing is due", () => {
    const paused = jar({
      recurring: { amount: 500, cadence: "daily", paused: true },
    });
    expect(
      runDueRecurring(paused, new Date("2027-01-01T00:00:00.000Z")).applied,
    ).toBe(0);

    const future = jar({
      createdAt: "2026-01-01T00:00:00.000Z",
      recurring: {
        amount: 500,
        cadence: "weekly",
        paused: false,
        nextDate: "2099-01-01T00:00:00.000Z",
      },
    });
    expect(
      runDueRecurring(future, new Date("2026-06-01T00:00:00.000Z")).applied,
    ).toBe(0);
  });

  it("advances monthly schedules by calendar month", () => {
    const monthly = jar({
      createdAt: "2026-01-31T00:00:00.000Z",
      recurring: { amount: 1200, cadence: "monthly", paused: false },
    });
    const result = runDueRecurring(
      monthly,
      new Date("2026-03-15T00:00:00.000Z"),
    );
    // Jan 31 and Feb 28 (clamped) are both due by Mar 15.
    expect(result.applied).toBe(2);
    expect(result.jar.balance).toBe(2400);
  });
});

describe("deadlineCountdown", () => {
  const now = new Date("2026-08-24T00:00:00.000Z");

  it("counts days for ISO deadlines", () => {
    expect(deadlineCountdown("2026-08-24", now)).toBe("Due today");
    expect(deadlineCountdown("2026-08-25", now)).toBe("1 day left");
    expect(deadlineCountdown("2026-09-10", now)).toBe("17 days left");
  });

  it("parses Month Year deadlines as the end of that month", () => {
    // Far beyond 45 days, so the original friendly text passes through.
    expect(deadlineCountdown("December 2026", now)).toBe("December 2026");
  });

  it("returns past-deadline and passthrough text safely", () => {
    expect(deadlineCountdown("2026-01-01", now)).toBe("Past deadline");
    expect(deadlineCountdown("someday maybe", now)).toBe("someday maybe");
    expect(deadlineCountdown(undefined, now)).toBeUndefined();
  });
});

describe("nextRecurringDate", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");

  it("keeps a still-future date when amount and cadence are unchanged", () => {
    const previous = {
      amount: 500,
      cadence: "weekly" as const,
      nextDate: "2026-06-20T12:00:00.000Z",
    };
    expect(
      nextRecurringDate({ previous, amount: 500, cadence: "weekly", now }),
    ).toBe("2026-06-20T12:00:00.000Z");
  });

  it("restarts when the amount or the cadence changes", () => {
    const previous = {
      amount: 500,
      cadence: "weekly" as const,
      nextDate: "2026-06-20T12:00:00.000Z",
    };
    expect(
      nextRecurringDate({ previous, amount: 700, cadence: "weekly", now }),
    ).toBeUndefined();
    expect(
      nextRecurringDate({ previous, amount: 500, cadence: "monthly", now }),
    ).toBeUndefined();
  });

  it("restarts when the previous date is no longer in the future", () => {
    const previous = {
      amount: 500,
      cadence: "weekly" as const,
      nextDate: "2026-06-01T12:00:00.000Z",
    };
    expect(
      nextRecurringDate({ previous, amount: 500, cadence: "weekly", now }),
    ).toBeUndefined();
  });

  it("starts fresh when there was no previous rule", () => {
    expect(
      nextRecurringDate({
        previous: undefined,
        amount: 500,
        cadence: "weekly",
        now,
      }),
    ).toBeUndefined();
  });
});

describe("active jars exclude archived history", () => {
  it("activeJars keeps only jars that are not archived", () => {
    const active = jar();
    const archived = jar({ id: "old", archived: true });
    expect(activeJars([active, archived])).toEqual([active]);
    expect(activeJars([archived])).toEqual([]);
  });

  it("monthlyDeposits ignores deposits from archived jars", () => {
    const archived = jar({
      archived: true,
      entries: [
        {
          id: "e1",
          amount: 5000,
          direction: "deposit",
          at: "2026-08-02T00:00:00.000Z",
        },
      ],
    });
    const months = monthlyDeposits([archived], new Date(2026, 7, 15));
    expect(months.every((month) => month.total === 0)).toBe(true);
  });

  it("badgeStats ignores archived jars entirely", () => {
    const archived = jar({
      archived: true,
      balance: 10000,
      target: 10000,
      streak: 9,
      entries: [
        {
          id: "e1",
          amount: 5000,
          direction: "deposit",
          at: "2026-08-02T00:00:00.000Z",
        },
      ],
    });
    expect(badgeStats([archived])).toMatchObject({
      deposits: 0,
      totalDeposited: 0,
      maxStreak: 0,
      completed: 0,
    });
  });
});

describe("weeklyDelta", () => {
  const now = new Date("2026-08-24T12:00:00.000Z");
  const entry = (
    id: string,
    amount: number,
    direction: "deposit" | "withdrawal",
    at: string,
  ) => ({ id, amount, direction, at });

  it("sums only deposits in the inclusive trailing seven-day window", () => {
    expect(
      weeklyDelta(
        [
          {
            entries: [
              entry("inside", 2500, "deposit", "2026-08-18T12:00:00.000Z"),
              entry(
                "withdrawal",
                9999,
                "withdrawal",
                "2026-08-20T12:00:00.000Z",
              ),
            ],
          },
          {
            entries: [
              entry("now", 500, "deposit", "2026-08-24T12:00:00.000Z"),
              entry("old", 7000, "deposit", "2026-08-17T11:59:59.999Z"),
              entry("future", 8000, "deposit", "2026-08-24T12:00:00.001Z"),
            ],
          },
        ],
        now,
      ),
    ).toBe(3000);
  });
});

describe("monthlyDeposits", () => {
  const now = new Date(2026, 7, 15); // Aug 15, 2026
  const dep = (amount: number, date: Date) => ({
    id: `e-${amount}-${date.getTime()}`,
    amount,
    direction: "deposit" as const,
    source: "manual" as const,
    at: date.toISOString(),
  });

  it("buckets deposits into the last 6 months, oldest first, ignoring withdrawals and older entries", () => {
    const j = jar({
      entries: [
        dep(1000, new Date(2026, 7, 2)),
        {
          id: "w1",
          amount: 500,
          direction: "withdrawal" as const,
          source: "manual" as const,
          at: new Date(2026, 7, 3).toISOString(),
        },
        dep(2000, new Date(2026, 5, 20)),
        dep(9999, new Date(2026, 1, 28)),
      ],
    });
    const months = monthlyDeposits([j], now);
    expect(months).toHaveLength(6);
    expect(months[5]).toEqual({ label: "Aug", total: 1000 });
    expect(months[3]).toEqual({ label: "Jun", total: 2000 });
    expect(months.every((m) => m.label.length === 3)).toBe(true);
    // Feb deposit is outside the 6-month window.
    expect(months.reduce((s, m) => s + m.total, 0)).toBe(3000);
  });

  it("aggregates deposits across multiple jars", () => {
    const a = jar({ entries: [dep(100, new Date(2026, 7, 1))] });
    const b = jar({ entries: [dep(250, new Date(2026, 7, 10))] });
    expect(monthlyDeposits([a, b], now).at(-1)).toEqual({
      label: "Aug",
      total: 350,
    });
  });
});
