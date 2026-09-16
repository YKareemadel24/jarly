import { describe, expect, it } from "vitest";

import {
  type SharedJarEntryRow,
  type SharedJarMemberRow,
  type SharedJarRow,
  orderEntriesNewestFirst,
  sharedJarTotals,
  validateContribution,
} from "../shared/shared-jar";

const jar: Pick<SharedJarRow, "target" | "ownerId"> = { target: 10_000, ownerId: 1 };

const members: SharedJarMemberRow[] = [
  { userId: 1, displayName: "You" },
  { userId: 2, displayName: "Mia" },
];

const entry = (
  userId: number,
  amount: number,
  direction: "deposit" | "withdrawal" = "deposit",
  id = Math.random(),
  createdAt = "2026-03-01T00:00:00.000Z",
): SharedJarEntryRow => ({ id, userId, amount, direction, createdAt });

describe("sharedJarTotals", () => {
  it("sums deposits into a balance and a progress percentage", () => {
    const totals = sharedJarTotals(jar, members, [entry(1, 3000), entry(2, 2000)], 1);
    expect(totals.balance).toBe(5000);
    expect(totals.totalDeposited).toBe(5000);
    expect(totals.progress).toBe(50);
    expect(totals.depositCount).toBe(2);
  });

  it("attributes contributions per member, highest first", () => {
    const totals = sharedJarTotals(jar, members, [entry(1, 1000), entry(2, 2500)], 1);
    expect(totals.members.map((m) => m.displayName)).toEqual(["Mia", "You"]);
    expect(totals.members[0].contributed).toBe(2500);
    expect(totals.members[1].contributed).toBe(1000);
  });

  it("subtracts withdrawals from both the balance and the author's share", () => {
    const totals = sharedJarTotals(jar, members, [entry(1, 5000), entry(1, 2000, "withdrawal")], 1);
    expect(totals.balance).toBe(3000);
    expect(totals.totalDeposited).toBe(5000);
    expect(totals.members.find((m) => m.userId === 1)?.contributed).toBe(3000);
  });

  it("marks the viewer and the owner", () => {
    const totals = sharedJarTotals(jar, members, [], 2);
    expect(totals.members.find((m) => m.userId === 2)?.you).toBe(true);
    expect(totals.members.find((m) => m.userId === 1)?.you).toBe(false);
    expect(totals.members.find((m) => m.userId === 1)?.isOwner).toBe(true);
  });

  it("reports zeroed members for an untouched jar", () => {
    const totals = sharedJarTotals(jar, members, [], 1);
    expect(totals.balance).toBe(0);
    expect(totals.progress).toBe(0);
    expect(totals.members.every((m) => m.contributed === 0)).toBe(true);
  });

  it("never divides by a zero target", () => {
    const totals = sharedJarTotals({ target: 0, ownerId: 1 }, members, [entry(1, 500)], 1);
    expect(totals.progress).toBe(0);
    expect(totals.balance).toBe(500);
  });

  it("clamps progress above 100", () => {
    const totals = sharedJarTotals({ target: 1000, ownerId: 1 }, members, [entry(1, 5000)], 1);
    expect(totals.progress).toBe(100);
  });

  it("ignores malformed amount rows instead of corrupting the balance", () => {
    const totals = sharedJarTotals(
      jar,
      members,
      [entry(1, 1000), entry(2, 0), entry(1, -500), entry(2, 2.5), entry(1, Number.NaN)],
      1,
    );
    expect(totals.balance).toBe(1000);
    expect(totals.depositCount).toBe(1);
  });

  it("lists a member with no entries without dropping them", () => {
    const totals = sharedJarTotals(jar, [...members, { userId: 3, displayName: "Dad" }], [entry(1, 100)], 1);
    expect(totals.members).toHaveLength(3);
    expect(totals.members.find((m) => m.displayName === "Dad")?.contributed).toBe(0);
  });

  it("accepts Date and string timestamps interchangeably", () => {
    const asDate = sharedJarTotals(jar, members, [{ ...entry(1, 100, "deposit", 1), createdAt: new Date("2026-03-01T00:00:00.000Z") }], 1);
    const asString = sharedJarTotals(jar, members, [entry(1, 100, "deposit", 1)], 1);
    expect(asDate.balance).toBe(asString.balance);
  });
});

describe("orderEntriesNewestFirst", () => {
  it("sorts by time descending regardless of input order", () => {
    const ordered = orderEntriesNewestFirst([
      entry(1, 100, "deposit", 1, "2026-03-01T00:00:00.000Z"),
      entry(1, 100, "deposit", 2, "2026-05-01T00:00:00.000Z"),
      entry(1, 100, "deposit", 3, "2026-04-01T00:00:00.000Z"),
    ]);
    expect(ordered.map((e) => e.id)).toEqual([2, 3, 1]);
  });

  it("does not mutate the input array", () => {
    const input = [entry(1, 100, "deposit", 1, "2026-03-01T00:00:00.000Z"), entry(1, 100, "deposit", 2, "2026-04-01T00:00:00.000Z")];
    orderEntriesNewestFirst(input);
    expect(input.map((e) => e.id)).toEqual([1, 2]);
  });

  it("tolerates an unparseable timestamp without throwing", () => {
    const ordered = orderEntriesNewestFirst([
      { id: 1, createdAt: "not-a-date" },
      { id: 2, createdAt: "2026-04-01T00:00:00.000Z" },
    ]);
    expect(ordered[0].id).toBe(2);
  });
});

describe("validateContribution", () => {
  it("accepts a positive integer deposit", () => {
    expect(validateContribution(500, "deposit", 0)).toBeNull();
  });

  it("rejects floats, zero and negatives", () => {
    expect(validateContribution(5.5, "deposit", 0)).toMatch(/integer/);
    expect(validateContribution(0, "deposit", 0)).toMatch(/greater than zero/);
    expect(validateContribution(-100, "deposit", 0)).toMatch(/integer|greater than zero/);
  });

  it("rejects a withdrawal above the balance but allows the exact balance", () => {
    expect(validateContribution(600, "withdrawal", 500)).toMatch(/more than the jar holds/);
    expect(validateContribution(500, "withdrawal", 500)).toBeNull();
  });
});