import { createRequire } from "node:module";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SavingsPlan } from "../components/savings-plan";
import type { Jar } from "../lib/savings-core";

const renderToStaticMarkup: (element: ReactNode) => string = createRequire(
  import.meta.url,
)("react-dom/server").renderToStaticMarkup;

vi.mock("react-native", () => ({
  View: "div",
  Text: "span",
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock("@/hooks/use-colors", () => ({ useColors: () => ({}) }));
vi.mock("@/lib/savings-store", () => ({
  useMoney: () => (minor: number) => `USD ${minor}`,
}));

const jar = (overrides: Partial<Jar> = {}): Jar => ({
  id: "trip",
  name: "Trip",
  target: 10000,
  balance: 2000,
  accent: "ocean",
  icon: "flight",
  kind: "goal",
  createdAt: "2026-09-01T00:00:00.000Z",
  deadline: "2026-11-19",
  milestonesHit: [],
  entries: [
    {
      id: "one",
      amount: 1000,
      at: "2026-10-10T12:00:00.000Z",
      direction: "deposit",
    },
    {
      id: "two",
      amount: 1000,
      at: "2026-10-20T12:00:00.000Z",
      direction: "deposit",
    },
  ],
  ...overrides,
});
const render = (value: Jar) =>
  renderToStaticMarkup(createElement(SavingsPlan, { jar: value }));

describe("SavingsPlan", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T12:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("shows integer weekly amounts and a qualified finish estimate with recorded history", () => {
    const html = render(jar());
    expect(html).toContain("USD 2000");
    expect(html).toContain("USD 500");
    expect(html).toContain("Estimated finish");
    expect(html).toContain("Withdrawals can delay");
  });

  it("does not promise a finish from a recurring schedule without recorded history", () => {
    const html = render(
      jar({
        entries: [],
        recurring: { amount: 2000, cadence: "weekly", paused: false },
      }),
    );
    expect(html).not.toContain("Estimated finish");
    expect(html).toContain("two different days");
  });

  it("does not count an undone deposit as history or recent pace", () => {
    const value = jar();
    value.entries.push({
      id: "undo",
      undoOf: "one",
      direction: "withdrawal",
      amount: 1000,
      at: "2026-10-21T12:00:00.000Z",
    });
    const html = render(value);
    expect(html).not.toContain("Estimated finish");
    expect(html).toContain("USD 250");
  });

  it("does not turn deposits on one day into a finish estimate", () => {
    const value = jar();
    value.entries[1].at = value.entries[0].at;
    const html = render(value);
    expect(html).not.toContain("Estimated finish");
    expect(html).toContain("two different days");
  });

  it("shows zero recent pace without forecasting from old deposits", () => {
    const value = jar();
    value.entries = value.entries.map((entry) => ({
      ...entry,
      at: "2026-08-10T12:00:00.000Z",
    }));
    const html = render(value);
    expect(html).toContain("USD 0");
    expect(html).not.toContain("Estimated finish");
  });

  it("shows the amount remaining today instead of a weekly promise on the deadline", () => {
    const html = render(jar({ deadline: "2026-10-22" }));
    expect(html).toContain("Remaining today");
    expect(html).toContain("USD 8000");
    expect(html).not.toContain("Weekly amount to target");
  });

  it("shows the full remaining amount for a deadline less than a week away", () => {
    const html = render(jar({ deadline: "2026-10-25" }));
    expect(html).toContain("Remaining by deadline");
    expect(html).toContain("USD 8000");
    expect(html).not.toContain("USD 8000 / week");
    expect(html).not.toContain("Weekly amount to target");
    expect(html).toContain("Estimated finish");
  });

  it.each([undefined, "someday"])(
    "asks for a date without inventing a dated weekly plan (%s)",
    (deadline) => {
      const html = render(jar({ deadline }));
      expect(html).toContain("Set a target date");
      expect(html).toContain("USD 500");
      expect(html).not.toContain("Estimated finish");
    },
  );

  it("does not present a catch-up weekly amount as a way to meet a past deadline", () => {
    const html = render(jar({ deadline: "2026-10-21" }));
    expect(html).toContain("deadline has passed");
    expect(html).not.toContain("Weekly amount to target");
  });

  it("acknowledges a funded target without forecasting more saving", () => {
    const html = render(jar({ balance: 10000 }));
    expect(html).toContain("Goal funded");
    expect(html).not.toContain("Estimated finish");
    expect(html).not.toContain("Weekly amount to target");
  });
});
