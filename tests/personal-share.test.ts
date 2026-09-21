import { describe, expect, it } from "vitest";

import { type Jar } from "../lib/savings-core";
import { openingAdjustment, personalSharePayload, personalShareSchema, replaceWithShared } from "../shared/personal-share";

const jar = (overrides: Partial<Jar> = {}): Jar => ({
  id: "jar-1",
  name: "Bike fund",
  target: 500_00,
  balance: 120_00,
  accent: "mint",
  icon: "🚲",
  kind: "goal",
  createdAt: "2026-02-01T00:00:00.000Z",
  milestonesHit: [25],
  entries: [
    { id: "e1", amount: 100_00, direction: "deposit", at: "2026-02-02T00:00:00.000Z", note: "start" },
    { id: "e2", amount: 30_00, direction: "withdrawal", at: "2026-02-03T00:00:00.000Z" },
    { id: "e3", amount: 50_00, direction: "deposit", at: "2026-02-04T00:00:00.000Z", source: "recurring" },
  ],
  ...overrides,
});

describe("personalSharePayload", () => {
  it("carries metadata and every entry into a valid share request", () => {
    const payload = personalSharePayload(jar());
    expect(payload.sourceLocalId).toBe("jar-1");
    expect(payload.name).toBe("Bike fund");
    expect(payload.balance).toBe(120_00);
    expect(payload.entries).toHaveLength(3);
    // The request must satisfy the server's schema, or nothing else matters.
    expect(personalShareSchema.safeParse(payload).success).toBe(true);
  });

  it("keeps each entry's own timestamp and note", () => {
    const payload = personalSharePayload(jar());
    expect(payload.entries[0]).toMatchObject({ amount: 100_00, direction: "deposit", at: "2026-02-02T00:00:00.000Z", note: "start" });
    expect(payload.entries[2].source).toBe("recurring");
  });
});

describe("openingAdjustment", () => {
  it("is zero when recorded history already explains the balance", () => {
    const explained = jar({ balance: 100_00 - 30_00 + 50_00 });
    expect(openingAdjustment(personalSharePayload(explained))).toBe(0);
  });

  it("is the unexplained remainder for a legacy balance", () => {
    // 120 − (100 − 30 + 50) = 0 here, so tilt the balance to force a remainder.
    const legacy = jar({ balance: 150_00 });
    expect(openingAdjustment(personalSharePayload(legacy))).toBe(30_00);
  });
});

describe("personalShareSchema", () => {
  it("rejects history older than the database's date range", () => {
    const result = personalShareSchema.safeParse(personalSharePayload(jar({
      entries: [{ id: "e", amount: 1, direction: "deposit", at: "1969-01-01T00:00:00.000Z" }],
    })));
    expect(result.success).toBe(false);
  });

  it("rejects non-integer money", () => {
    const payload = personalSharePayload(jar());
    const result = personalShareSchema.safeParse({ ...payload, balance: 120.5 });
    expect(result.success).toBe(false);
  });

  it("rejects an over-long history instead of silently truncating it", () => {
    const entries = Array.from({ length: 2001 }, (_, index) => ({
      id: `e${index}`, amount: 1, direction: "deposit" as const, at: "2026-02-02T00:00:00.000Z",
    }));
    const payload = personalSharePayload(jar({ entries }));
    expect(personalShareSchema.safeParse(payload).success).toBe(false);
  });
});

describe("replaceWithShared", () => {
  it("swaps the local jar for its shared counterpart, preserving order elsewhere", () => {
    const local = { ...jar(), id: "jar-1" };
    const other = { ...jar(), id: "jar-2", name: "Other" };
    const shared = { ...local, id: "shared-9", remoteId: "9" };
    const result = replaceWithShared([other, local], "jar-1", shared);
    expect(result.map((item) => item.id)).toEqual(["jar-2", "shared-9"]);
  });

  it("leaves the list untouched when the local jar is already gone", () => {
    const shared = { ...jar(), id: "shared-9" };
    const list = [{ ...jar(), id: "shared-9" }];
    expect(replaceWithShared(list, "jar-1", shared)).toEqual(list);
  });
});
