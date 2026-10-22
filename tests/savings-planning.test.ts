import { describe, expect, it } from "vitest";
import { paceProjection } from "../lib/domain/insights";

const now = new Date(2026, 9, 22, 12);
const jar = { target: 8000, balance: 0, deadline: "2026-11-01", entries: [] };
describe("weekly savings requirement", () => {
  it("accounts for partial weeks instead of extending the deadline", () => {
    expect(paceProjection(jar, now).requiredPerWeekMinor).toBe(5600);
  });
  it("rounds up by a minor unit without overflowing near the money limit", () => {
    expect(
      paceProjection(
        { ...jar, target: Number.MAX_SAFE_INTEGER, deadline: "2026-11-05" },
        now,
      ).requiredPerWeekMinor,
    ).toBe(4503599627370496);
  });
  it("limits the short-deadline requirement to the full amount remaining", () => {
    expect(
      paceProjection({ ...jar, deadline: "2026-10-25" }, now)
        .requiredPerWeekMinor,
    ).toBe(8000);
  });
  it("omits finish dates outside the supported date range", () => {
    const projection = paceProjection(
      {
        ...jar,
        target: 100000000000,
        balance: 2,
        entries: [
          {
            id: "tiny",
            amount: 2,
            direction: "deposit",
            at: now.toISOString(),
          },
        ],
      },
      now,
    );
    expect(projection.status).toBe("behind");
    expect(projection.projectedDate).toBeUndefined();
  });
});
