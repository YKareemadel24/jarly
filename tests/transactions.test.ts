import { describe, expect, it } from "vitest";
import { applyEntry, effectiveEntries, type Jar } from "../lib/domain/jar";
import { correctEntry, undoEntry } from "../lib/domain/transactions";
import { monthlyDeposits, weeklyDelta } from "../lib/domain/insights";
import { badgeStats } from "../lib/domain/badges";

const now = new Date("2026-10-22T12:00:00Z");
const empty = (): Jar => ({
  id: "trip",
  name: "Trip",
  target: 10000,
  balance: 0,
  accent: "ocean",
  icon: "flight",
  kind: "goal",
  createdAt: "2026-10-01T12:00:00Z",
  milestonesHit: [],
  entries: [],
});
function record(
  jar: Jar,
  amount: number,
  direction: "deposit" | "withdrawal",
  day: number,
): Jar {
  return applyEntry(
    jar,
    amount,
    direction,
    undefined,
    "manual",
    new Date(`2026-10-${day}T12:00:00Z`),
  )!.jar;
}

describe("transaction corrections", () => {
  it("updates balance and retains the previous amount, date and note", () => {
    const jar = record(empty(), 4000, "deposit", 18);
    const entry = jar.entries[0];
    const corrected = correctEntry(
      jar,
      entry.id,
      { amount: 6000, at: "2026-10-19T12:00:00Z", note: "Correct amount" },
      now,
    )!;
    expect(corrected.balance).toBe(6000);
    expect(corrected.entries[0]).toMatchObject({
      id: entry.id,
      amount: 6000,
      note: "Correct amount",
      revisions: [{ amount: 4000, at: entry.at, changedAt: now.toISOString() }],
    });
    expect(jar.balance).toBe(4000);
    expect(jar.entries[0].revisions).toBeUndefined();
  });
  it("corrects a withdrawal without losing the opening balance of a legacy jar", () => {
    const jar = record({ ...empty(), balance: 5000 }, 2000, "withdrawal", 18);
    expect(
      correctEntry(
        jar,
        jar.entries[0].id,
        { amount: 1000, at: jar.entries[0].at },
        now,
      )?.balance,
    ).toBe(4000);
  });
  it("rejects a correction that makes a past withdrawal impossible even if the current balance stays positive", () => {
    let jar = record(empty(), 10000, "deposit", 18);
    const id = jar.entries[0].id;
    jar = record(record(jar, 8000, "withdrawal", 19), 10000, "deposit", 20);
    expect(
      correctEntry(jar, id, { amount: 3000, at: "2026-10-18T12:00:00Z" }, now),
    ).toBeNull();
    expect(
      correctEntry(jar, id, { amount: 10000, at: "2026-10-21T12:00:00Z" }, now),
    ).toBeNull();
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid correction amount %s",
    (amount) => {
      const jar = record(empty(), 1000, "deposit", 18);
      expect(
        correctEntry(
          jar,
          jar.entries[0].id,
          { amount, at: jar.entries[0].at },
          now,
        ),
      ).toBeNull();
    },
  );
  it.each(["invalid", "2026-10-23T12:00:00Z"])(
    "rejects invalid or future dates: %s",
    (at) => {
      const jar = record(empty(), 1000, "deposit", 18);
      expect(
        correctEntry(jar, jar.entries[0].id, { amount: 1000, at }, now),
      ).toBeNull();
    },
  );
  it("rebuilds habit streak metadata after changing a deposit date", () => {
    let jar = record({ ...empty(), kind: "habit" }, 1000, "deposit", 18);
    jar = record(jar, 1000, "deposit", 19);
    expect(jar.streak).toBe(2);
    const corrected = correctEntry(
      jar,
      jar.entries[0].id,
      { amount: 1000, at: "2026-10-21T12:00:00Z" },
      now,
    )!;
    expect(corrected.streak).toBe(1);
    expect(corrected.lastDepositAt).toBe("2026-10-21T12:00:00.000Z");
  });
});

describe("transaction Undo", () => {
  it("refuses Undo funded only by a future deposit", () => {
    let jar = record(empty(), 10000, "deposit", 19);
    const originalId = jar.entries[0].id;
    jar = record(record(jar, 10000, "withdrawal", 20), 10000, "deposit", 23);
    expect(undoEntry(jar, originalId, now)).toBeNull();
  });
  it("refuses Undo before the original timestamp so saved audit links remain valid", () => {
    const jar = record(empty(), 1000, "deposit", 23);
    expect(undoEntry(jar, jar.entries[0].id, now)).toBeNull();
  });
  it("allows note correction after Undo of an older deposit funded by later savings", () => {
    let jar = record(empty(), 10000, "deposit", 18);
    const originalId = jar.entries[0].id;
    jar = record(record(jar, 10000, "withdrawal", 19), 10000, "deposit", 20);
    const later = jar.entries[0];
    jar = undoEntry(jar, originalId, now)!;
    expect(jar.balance).toBe(0);
    const corrected = correctEntry(
      jar,
      later.id,
      { amount: later.amount, at: later.at, note: "Later deposit" },
      now,
    );
    expect(corrected?.balance).toBe(0);
    expect(
      corrected?.entries.find((entry) => entry.id === later.id)?.note,
    ).toBe("Later deposit");
  });
  it("reverses a deposit with an audit link and prevents duplicate Undo or edits", () => {
    const jar = record(empty(), 3000, "deposit", 18);
    const id = jar.entries[0].id;
    const undone = undoEntry(jar, id, now)!;
    expect(undone.balance).toBe(0);
    expect(undone.entries).toHaveLength(2);
    expect(undone.entries[0]).toMatchObject({
      direction: "withdrawal",
      amount: 3000,
      undoOf: id,
    });
    expect(effectiveEntries(undone.entries)).toEqual([]);
    expect(weeklyDelta([undone], now)).toBe(0);
    expect(monthlyDeposits([undone], now, 1)[0].total).toBe(0);
    expect(badgeStats([undone]).deposits).toBe(0);
    expect(undoEntry(undone, id, now)).toBeNull();
    expect(undoEntry(undone, undone.entries[0].id, now)).toBeNull();
    expect(
      correctEntry(undone, id, { amount: 4000, at: jar.entries[0].at }, now),
    ).toBeNull();
  });
  it("reverses a withdrawal without awarding extra progress or habit days", () => {
    let jar = record({ ...empty(), kind: "habit" }, 5000, "deposit", 18);
    jar = record(jar, 2000, "withdrawal", 19);
    const undone = undoEntry(jar, jar.entries[0].id, now)!;
    expect(undone.balance).toBe(5000);
    expect(undone.streak).toBe(1);
    expect(undone.lastDepositAt).toBe(jar.lastDepositAt);
    expect(undone.milestonesHit).toEqual(jar.milestonesHit);
    expect(effectiveEntries(undone.entries)).toHaveLength(1);
  });
  it("rejects reversing a deposit when its money has since been withdrawn", () => {
    const funded = record(empty(), 5000, "deposit", 18);
    const jar = record(funded, 4000, "withdrawal", 19);
    expect(undoEntry(jar, funded.entries[0].id, now)).toBeNull();
  });
});
