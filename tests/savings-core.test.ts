import { describe, expect, it, vi } from "vitest";

import {
  applyEntry,
  crossedMilestones,
  deadlineCountdown,
  type Jar,
  money,
  runDueRecurring,
  sanitizeAmountInput,
  toMinor,
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
    expect(crossedMilestones(jar({ milestonesHit: [25, 50] }), 8000)).toEqual([75]);
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
    const result = applyEntry(jar({ kind: "habit" }), 1000, "deposit", undefined, "manual", day("2026-03-10T10:00:00Z"));
    expect(result?.jar.streak).toBe(1);
  });

  it("does not grow within the same day", () => {
    const base = jar({ kind: "habit", streak: 3, lastDepositAt: "2026-03-10T08:00:00Z" });
    const result = applyEntry(base, 1000, "deposit", undefined, "manual", day("2026-03-10T20:00:00Z"));
    expect(result?.jar.streak).toBe(3);
  });

  it("grows on consecutive days and resets after a gap", () => {
    const yesterday = jar({ kind: "habit", streak: 3, lastDepositAt: "2026-03-09T20:00:00Z" });
    expect(applyEntry(yesterday, 1000, "deposit", undefined, "manual", day("2026-03-10T09:00:00Z"))?.jar.streak).toBe(4);

    const stale = jar({ kind: "habit", streak: 9, lastDepositAt: "2026-03-01T20:00:00Z" });
    expect(applyEntry(stale, 1000, "deposit", undefined, "manual", day("2026-03-10T09:00:00Z"))?.jar.streak).toBe(1);
  });

  it("ignores goal jars entirely", () => {
    const result = applyEntry(jar({ kind: "goal", streak: 2 }), 1000, "deposit", undefined, "manual", day("2026-03-10T10:00:00Z"));
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
    expect(new Date(result.jar.recurring?.nextDate ?? "").toISOString()).toBe("2026-06-22T00:00:00.000Z");
    expect(result.jar.entries.filter((entry) => entry.source === "recurring")).toHaveLength(3);
  });

  it("does nothing when paused or when nothing is due", () => {
    const paused = jar({ recurring: { amount: 500, cadence: "daily", paused: true } });
    expect(runDueRecurring(paused, new Date("2027-01-01T00:00:00.000Z")).applied).toBe(0);

    const future = jar({
      createdAt: "2026-01-01T00:00:00.000Z",
      recurring: { amount: 500, cadence: "weekly", paused: false, nextDate: "2099-01-01T00:00:00.000Z" },
    });
    expect(runDueRecurring(future, new Date("2026-06-01T00:00:00.000Z")).applied).toBe(0);
  });

  it("advances monthly schedules by calendar month", () => {
    const monthly = jar({
      createdAt: "2026-01-31T00:00:00.000Z",
      recurring: { amount: 1200, cadence: "monthly", paused: false },
    });
    const result = runDueRecurring(monthly, new Date("2026-03-15T00:00:00.000Z"));
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
