import { describe, expect, it } from "vitest";

import { activitySections } from "../lib/activity-sections";
import type { Entry, Jar } from "../lib/savings-core";

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

const entry = (
  id: string,
  at: string,
  direction: Entry["direction"] = "deposit",
) => ({
  id,
  amount: 500,
  direction,
  at,
});

describe("activitySections", () => {
  const now = new Date(2026, 9, 22, 15);
  const localAt = (day: number, hour = 0, minute = 0, second = 0, ms = 0) =>
    new Date(2026, 9, day, hour, minute, second, ms).toISOString();
  const ids = (sections: ReturnType<typeof activitySections>) =>
    sections.flatMap((section) => section.data.map((row) => row.entry.id));

  it("combines jar, direction and range filters without archived history", () => {
    const jars = [
      jar({
        entries: [
          entry("match", localAt(22), "withdrawal"),
          entry("deposit", localAt(22)),
          entry("too-old", localAt(15), "withdrawal"),
        ],
      }),
      jar({
        id: "other",
        entries: [entry("other-jar", localAt(22), "withdrawal")],
      }),
      jar({
        archived: true,
        entries: [entry("archived", localAt(22), "withdrawal")],
      }),
    ];
    expect(
      ids(
        activitySections(jars, now, {
          jarId: "trip",
          direction: "withdrawal",
          range: "7days",
        }),
      ),
    ).toEqual(["match"]);
  });

  it.each([
    ["7days", 16, 15],
    ["30days", -7, -8],
  ] as const)(
    "includes local midnight and all of today for %s",
    (range, firstDay, previousDay) => {
      const jars = [
        jar({
          entries: [
            entry("before", localAt(previousDay, 23, 59, 59, 999)),
            entry("start", localAt(firstDay)),
            entry("tonight", localAt(22, 23, 59, 59, 999)),
            entry("tomorrow", localAt(23)),
          ],
        }),
      ];
      expect(ids(activitySections(jars, now, { range }))).toEqual([
        "tonight",
        "start",
      ]);
    },
  );

  it("returns no matches for a missing jar or unmatched direction", () => {
    const jars = [jar({ entries: [entry("deposit", localAt(22))] })];
    expect(activitySections(jars, now, { jarId: "missing" })).toEqual([]);
    expect(activitySections(jars, now, { direction: "withdrawal" })).toEqual(
      [],
    );
  });

  it("keeps equal-time entries stable and all filters compatible with old callers", () => {
    const jars = [
      jar({
        entries: [entry("first", localAt(22)), entry("second", localAt(22))],
      }),
      jar({ id: "other", entries: [entry("third", localAt(22))] }),
    ];
    expect(
      ids(activitySections(jars, now, { direction: "all", range: "all" })),
    ).toEqual(["first", "second", "third"]);
    expect(activitySections(jars, now, {})).toEqual(
      activitySections(jars, now),
    );
    expect(activitySections([], now)).toEqual([]);
  });

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
