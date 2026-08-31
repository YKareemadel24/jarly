import { describe, expect, it } from "vitest";

import { nextReminder } from "../lib/reminders";
import { type Jar } from "../lib/savings-core";

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

const at = "2026-06-15T12:00:00.000Z";

describe("nextReminder", () => {
  it("returns undefined when there is nothing due", () => {
    expect(nextReminder([jar()], new Date(at))).toBeUndefined();
  });

  it("returns undefined for a completed jar", () => {
    const full = jar({ balance: 10000, deadline: "2026-06-16" });
    expect(nextReminder([full], new Date(at))).toBeUndefined();
  });

  it("flags a recurring deposit that is due today as the top priority", () => {
    const scheduled = jar({
      recurring: { amount: 2500, cadence: "weekly", paused: false, nextDate: "2026-06-15T09:00:00.000Z" },
    });
    const reminder = nextReminder([scheduled], new Date(at));
    expect(reminder).toBeDefined();
    expect(reminder?.title).toContain("Japan trip");
    expect(reminder?.detail).toContain("due today");
  });

  it("surfaces an approaching deadline within a few days", () => {
    const deadline = jar({ deadline: "2026-06-18" });
    const reminder = nextReminder([deadline], new Date(at));
    expect(reminder?.title).toContain("deadline");
  });

  it("ignores a paused recurring rule", () => {
    const paused = jar({
      recurring: { amount: 2500, cadence: "weekly", paused: true, nextDate: "2026-06-15T09:00:00.000Z" },
    });
    expect(nextReminder([paused], new Date(at))).toBeUndefined();
  });
});