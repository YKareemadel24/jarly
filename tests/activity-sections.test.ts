import { describe, expect, it } from "vitest";

import { activitySections } from "../lib/activity-sections";
import type { Jar } from "../lib/savings-core";

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

const entry = (id: string, at: string) => ({
  id,
  amount: 500,
  direction: "deposit" as const,
  at,
});

describe("activitySections", () => {
  it("groups newest active transactions by local day and skips archived jars", () => {
    const sections = activitySections(
      [
        jar({
          entries: [
            entry("old", "2026-06-14T10:00:00.000Z"),
            entry("today-first", "2026-06-15T09:00:00.000Z"),
          ],
        }),
        jar({
          id: "archived",
          archived: true,
          entries: [entry("hidden", "2026-06-15T11:00:00.000Z")],
        }),
        jar({
          id: "home",
          name: "Home",
          entries: [entry("today-last", "2026-06-15T11:00:00.000Z")],
        }),
      ],
      new Date("2026-06-15T12:00:00.000Z"),
    );

    expect(sections.map((section) => section.title)).toEqual([
      "Today",
      "Yesterday",
    ]);
    expect(sections[0]?.data.map((row) => row.entry.id)).toEqual([
      "today-last",
      "today-first",
    ]);
    expect(sections[1]?.data[0]?.entry.id).toBe("old");
  });
});
