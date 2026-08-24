import { describe, expect, it, vi } from "vitest";

import { jarAccent, money, percent, type Jar } from "../lib/savings-core";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
  },
}));

const jar = (balance: number, target = 10000): Jar => ({
  id: "trip",
  name: "Japan trip",
  balance,
  target,
  accent: "ocean",
  icon: "flight",
  kind: "goal",
  createdAt: "2026-01-01T00:00:00.000Z",
  milestonesHit: [],
  entries: [],
});

describe("Saving Jar progress helpers", () => {
  it("calculates progress in minor units, including safe target and cap behavior", () => {
    expect(percent(jar(2500))).toBe(25);
    expect(percent(jar(15000))).toBe(100);
    expect(percent(jar(0, 0))).toBe(0);
  });

  it("formats money with cents preserved", () => {
    expect(money(123440)).toContain("1,234.40");
  });

  it("provides a visual accent for every selectable jar color", () => {
    expect(Object.keys(jarAccent)).toEqual(["coral", "amber", "mint", "ocean", "berry", "clay"]);
    expect(jarAccent.ocean).toMatch(/^#/);
  });
});
