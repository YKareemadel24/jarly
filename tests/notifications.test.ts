import { describe, expect, it, vi } from "vitest";

vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
  cancelAllScheduledNotificationsAsync: vi.fn(),
  scheduleNotificationAsync: vi.fn(),
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  SchedulableTriggerInputTypes: { DATE: "date" },
  AndroidImportance: { DEFAULT: 3 },
}));

vi.mock("react-native", () => ({
  Platform: { OS: "test" },
  AppState: { addEventListener: vi.fn() },
}));

import { dueNotifications } from "../lib/notifications";
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

describe("dueNotifications", () => {
  it("returns empty when nothing is due", () => {
    expect(dueNotifications([jar()], new Date(at))).toEqual([]);
  });

  it("schedules a morning ping for a recurring deposit due today", () => {
    const scheduled = jar({
      recurring: { amount: 2500, cadence: "weekly", paused: false, nextDate: "2026-06-15T09:00:00.000Z" },
    });
    const [ping] = dueNotifications([scheduled], new Date(at));
    expect(ping.jarId).toBe("trip");
    expect(ping.title).toContain("Japan trip");
    expect(ping.detail).toContain("due today");
    expect(new Date(ping.fireDate).getDate()).toBe(15);
  });

  it("prefers the recurring ping over the deadline ping for the same jar", () => {
    const both = jar({
      deadline: "2026-06-15",
      recurring: { amount: 2500, cadence: "weekly", paused: false, nextDate: "2026-06-15T09:00:00.000Z" },
    });
    expect(dueNotifications([both], new Date(at))).toHaveLength(1);
  });

  it("skips archived, funded, and paused jars", () => {
    const jars = [
      jar({ id: "a", archived: true, deadline: "2026-06-15" }),
      jar({ id: "b", balance: 10000, deadline: "2026-06-15" }),
      jar({ id: "c", recurring: { amount: 500, cadence: "weekly", paused: true, nextDate: "2026-06-15T09:00:00.000Z" } }),
    ];
    expect(dueNotifications(jars, new Date(at))).toEqual([]);
  });

  it("schedules a due-day ping for a deadline with no schedule", () => {
    const [ping] = dueNotifications([jar({ deadline: "2026-06-15" })], new Date(at));
    expect(ping.title).toContain("due today");
  });

  it("skips zero-amount schedules, unparseable deadlines, and funded jars", () => {
    const jars = [
      jar({ id: "z", recurring: { amount: 0, cadence: "weekly", paused: false, nextDate: "2026-06-15T09:00:00.000Z" } }),
      jar({ id: "u", deadline: "someday maybe" }),
      jar({ id: "f", balance: 10000, recurring: { amount: 2500, cadence: "weekly", paused: false, nextDate: "2026-06-15T09:00:00.000Z" } }),
    ];
    expect(dueNotifications(jars, new Date(at))).toEqual([]);
  });

  it("schedules tomorrow-morning for a deposit due tomorrow", () => {
    const scheduled = jar({
      recurring: { amount: 2500, cadence: "weekly", paused: false, nextDate: "2026-06-16T09:00:00.000Z" },
    });
    const [ping] = dueNotifications([scheduled], new Date(at));
    expect(new Date(ping.fireDate).getDate()).toBe(16);
    expect(ping.detail).toContain("due today");
  });

  it("falls back to one minute out when the morning slot passed", () => {
    const scheduled = jar({
      recurring: { amount: 2500, cadence: "weekly", paused: false, nextDate: "2026-06-15T09:00:00.000Z" },
    });
    const [ping] = dueNotifications([scheduled], new Date(at));
    const delta = new Date(ping.fireDate).getTime() - new Date(at).getTime();
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThanOrEqual(5 * 60_000);
  });
});
