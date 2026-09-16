import { describe, expect, it, vi } from "vitest";

import { type Jar, quickPresets } from "../lib/savings-core";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    multiGet: vi.fn(),
  },
}));

/** Fixed clock so pace windows and "recent" deposits are deterministic. */
const NOW = new Date("2026-08-24T12:00:00.000Z");

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

const dep = (amount: number, daysAgo: number) => ({
  id: `e-${amount}-${daysAgo}`,
  amount,
  direction: "deposit" as const,
  source: "manual" as const,
  at: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
});

const ids = (presets: ReturnType<typeof quickPresets>) => presets.map((preset) => preset.id);
const amountOf = (presets: ReturnType<typeof quickPresets>, id: string) =>
  presets.find((preset) => preset.id === id)?.amount;

describe("quickPresets", () => {
  it("returns only positive integer minor amounts and never more than four", () => {
    const presets = quickPresets(jar({ balance: 3333, entries: [dep(1500, 3), dep(900, 10)] }), NOW);
    expect(presets.length).toBeGreaterThan(0);
    expect(presets.length).toBeLessThanOrEqual(4);
    for (const preset of presets) {
      expect(Number.isInteger(preset.amount)).toBe(true);
      expect(preset.amount).toBeGreaterThan(0);
    }
  });

  it("rounds the balance up to the next clean step", () => {
    // 33.33 -> next 5.00 boundary is 35.00.
    const presets = quickPresets(jar({ balance: 3333 }), NOW);
    expect(amountOf(presets, "round-up")).toBe(167);
  });

  it("snaps a balance already on the boundary up a full step, never to zero", () => {
    const presets = quickPresets(jar({ balance: 5000 }), NOW);
    expect(amountOf(presets, "round-up")).toBe(500);
  });

  it("offers the exact gap to the next unreached milestone", () => {
    // 30% of a 100.00 target -> 20.00 needed to reach 50%.
    const presets = quickPresets(jar({ balance: 3000, target: 10_000, milestonesHit: [25] }), NOW);
    expect(amountOf(presets, "next-milestone")).toBe(2000);

    // 80% -> next is 100%.
    const nearDone = quickPresets(jar({ balance: 8000, target: 10_000, milestonesHit: [25, 50, 75] }), NOW);
    expect(amountOf(nearDone, "next-milestone")).toBe(2000);
  });

  it("drops the milestone preset once every level is recorded", () => {
    const funded = quickPresets(jar({ balance: 10_000, target: 10_000, milestonesHit: [25, 50, 75, 100] }), NOW);
    expect(ids(funded)).not.toContain("next-milestone");
    expect(ids(funded)).not.toContain("weekly-pace");
  });

  it("never divides by a zero target", () => {
    const presets = quickPresets(jar({ target: 0, balance: 1200 }), NOW);
    expect(ids(presets)).not.toContain("next-milestone");
    for (const preset of presets) expect(Number.isInteger(preset.amount)).toBe(true);
  });

  it("derives pace from trailing deposits and ignores stale ones", () => {
    // 40.00 in the last 28 days -> 10.00/week; the 200.00 from 60 days ago is out of window.
    const presets = quickPresets(jar({ balance: 0, entries: [dep(2500, 3), dep(1500, 20), dep(20_000, 60)] }), NOW);
    expect(amountOf(presets, "weekly-pace")).toBe(1000);
  });

  it("falls back to the recurring schedule when recent deposits are thin", () => {
    // Weekly 12.00 recurring beats the 4.00/week trailing rate.
    const presets = quickPresets(jar({ balance: 0, entries: [dep(1600, 5)], recurring: { amount: 1200, cadence: "weekly", paused: false } }), NOW);
    expect(amountOf(presets, "weekly-pace")).toBe(1200);
  });

  it("ignores a paused recurring schedule for pace", () => {
    const presets = quickPresets(jar({ balance: 0, recurring: { amount: 1200, cadence: "weekly", paused: true } }), NOW);
    expect(ids(presets)).not.toContain("weekly-pace");
  });

  it("repeats the most recent deposit", () => {
    // Entries are newest-first in the domain model.
    const presets = quickPresets(jar({ balance: 500, entries: [dep(1500, 1), dep(700, 9)] }), NOW);
    expect(amountOf(presets, "repeat-last")).toBe(1500);
  });

  it("never suggests the same amount twice", () => {
    // Balance 30.00 with a 100.00 target and a 20.00 last deposit would otherwise
    // produce two identical 20.00 chips (round-up and next-milestone).
    const presets = quickPresets(jar({ balance: 3000, target: 10_000, milestonesHit: [25], entries: [dep(2000, 2)] }), NOW);
    const amounts = presets.map((preset) => preset.amount);
    expect(new Set(amounts).size).toBe(amounts.length);
  });

  it("returns an empty list for a jar with nothing to suggest", () => {
    expect(quickPresets(jar({ balance: 0, target: 0 }), NOW)).toEqual([]);
  });

  it("tolerates a future-dated entry without inflating pace", () => {
    const presets = quickPresets(jar({ balance: 0, entries: [dep(5000, -5)] }), NOW);
    expect(ids(presets)).not.toContain("weekly-pace");
  });
});