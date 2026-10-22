import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dueNotifications,
  requestPermissionAndEnable,
  resyncNotifications,
} from "../lib/notifications";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { reportError } from "@/lib/error-reporting";
import { type Jar } from "../lib/savings-core";

vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
  cancelAllScheduledNotificationsAsync: vi.fn(),
  scheduleNotificationAsync: vi.fn(),
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  SchedulableTriggerInputTypes: { DATE: "date", DAILY: "daily" },
  AndroidImportance: { DEFAULT: 3 },
}));

vi.mock("react-native", () => ({
  Platform: { OS: "test" },
  AppState: { addEventListener: vi.fn() },
}));

vi.mock("@/lib/error-reporting", () => ({ reportError: vi.fn() }));

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

const at = new Date(2026, 5, 15, 12).toISOString();

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(Notifications.getPermissionsAsync)
    .mockReset()
    .mockResolvedValue({ granted: true } as Awaited<
      ReturnType<typeof Notifications.getPermissionsAsync>
    >);
});

afterEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(Platform, "OS", { configurable: true, value: "test" });
});

describe("dueNotifications", () => {
  it("uses personal weekdays and snooze instead of legacy due pings", () => {
    const now = new Date(2026, 5, 15, 12);
    const custom = jar({
      deadline: "2026-06-15",
      reminder: {
        enabled: true,
        hour: 18,
        minute: 30,
        weekdays: [1, 3],
        snoozedUntil: new Date(2026, 5, 16, 12).toISOString(),
      },
    });
    const pings = dueNotifications([custom], now);
    expect(pings.length).toBeGreaterThan(2);
    expect(
      pings.every(
        (ping) =>
          new Date(ping.fireDate) >= new Date(custom.reminder!.snoozedUntil!),
      ),
    ).toBe(true);
    expect(new Date(pings[0].fireDate).getDay()).toBe(3);
    expect(new Date(pings[0].fireDate).getHours()).toBe(18);
    expect(
      dueNotifications(
        [{ ...custom, reminder: { ...custom.reminder!, enabled: false } }],
        now,
      ),
    ).toEqual([]);
  });

  it("shares at most 63 jar slots fairly and suppresses archived or funded personal reminders", () => {
    const custom = jar({
      reminder: {
        enabled: true,
        hour: 18,
        minute: 0,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
      },
    });
    const pings = dueNotifications(
      [
        custom,
        { ...custom, id: "b" },
        { ...custom, id: "c" },
        { ...custom, id: "archived", archived: true },
        { ...custom, id: "complete", balance: custom.target },
      ],
      new Date(at),
    );
    expect(pings).toHaveLength(63);
    for (const id of ["trip", "b", "c"])
      expect(pings.filter((ping) => ping.jarId === id)).toHaveLength(21);
  });
  it("returns empty when nothing is due", () => {
    expect(dueNotifications([jar()], new Date(at))).toEqual([]);
  });

  it("schedules a morning ping for a recurring deposit due today", () => {
    const scheduled = jar({
      recurring: {
        amount: 2500,
        cadence: "weekly",
        paused: false,
        nextDate: "2026-06-15T09:00:00.000Z",
      },
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
      recurring: {
        amount: 2500,
        cadence: "weekly",
        paused: false,
        nextDate: "2026-06-15T09:00:00.000Z",
      },
    });
    expect(dueNotifications([both], new Date(at))).toHaveLength(1);
  });

  it("skips archived, funded, and paused jars", () => {
    const jars = [
      jar({ id: "a", archived: true, deadline: "2026-06-15" }),
      jar({ id: "b", balance: 10000, deadline: "2026-06-15" }),
      jar({
        id: "c",
        recurring: {
          amount: 500,
          cadence: "weekly",
          paused: true,
          nextDate: "2026-06-15T09:00:00.000Z",
        },
      }),
    ];
    expect(dueNotifications(jars, new Date(at))).toEqual([]);
  });

  it("schedules a due-day ping for a deadline with no schedule", () => {
    const [ping] = dueNotifications(
      [jar({ deadline: "2026-06-15" })],
      new Date(at),
    );
    expect(ping.title).toContain("due today");
  });

  it("skips zero-amount schedules, unparseable deadlines, and funded jars", () => {
    const jars = [
      jar({
        id: "z",
        recurring: {
          amount: 0,
          cadence: "weekly",
          paused: false,
          nextDate: "2026-06-15T09:00:00.000Z",
        },
      }),
      jar({ id: "u", deadline: "someday maybe" }),
      jar({
        id: "f",
        balance: 10000,
        recurring: {
          amount: 2500,
          cadence: "weekly",
          paused: false,
          nextDate: "2026-06-15T09:00:00.000Z",
        },
      }),
    ];
    expect(dueNotifications(jars, new Date(at))).toEqual([]);
  });

  it("schedules tomorrow-morning for a deposit due tomorrow", () => {
    const scheduled = jar({
      recurring: {
        amount: 2500,
        cadence: "weekly",
        paused: false,
        nextDate: "2026-06-16T09:00:00.000Z",
      },
    });
    const [ping] = dueNotifications([scheduled], new Date(at));
    expect(new Date(ping.fireDate).getDate()).toBe(16);
    expect(ping.detail).toContain("due today");
  });

  it("falls back to one minute out when the morning slot passed", () => {
    const scheduled = jar({
      recurring: {
        amount: 2500,
        cadence: "weekly",
        paused: false,
        nextDate: "2026-06-15T09:00:00.000Z",
      },
    });
    const [ping] = dueNotifications([scheduled], new Date(at));
    const delta = new Date(ping.fireDate).getTime() - new Date(at).getTime();
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThanOrEqual(5 * 60_000);
  });
});

describe("notification resync", () => {
  it("replaces personal dates on pause, funding, archive and global disable", async () => {
    const scheduled: unknown[] = [];
    vi.mocked(
      Notifications.cancelAllScheduledNotificationsAsync,
    ).mockImplementation(async () => {
      scheduled.length = 0;
    });
    vi.mocked(Notifications.scheduleNotificationAsync).mockImplementation(
      async (request) => {
        scheduled.push(request);
        return "scheduled";
      },
    );
    const custom = jar({
      reminder: { enabled: true, hour: 18, minute: 0, weekdays: [1] },
    });
    await resyncNotifications([custom], { enabled: true, now: new Date(at) });
    expect(scheduled).toHaveLength(64);
    for (const next of [
      { ...custom, reminder: { ...custom.reminder!, enabled: false } },
      { ...custom, archived: true },
      { ...custom, balance: custom.target },
    ]) {
      await resyncNotifications([next], { enabled: true, now: new Date(at) });
      expect(scheduled).toHaveLength(1);
    }
    await resyncNotifications([custom], { enabled: false, now: new Date(at) });
    expect(scheduled).toHaveLength(0);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
  it("cancels existing schedules and refuses new ones without OS permission", async () => {
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValueOnce({
      granted: false,
    } as Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>);
    await resyncNotifications([jar()], { enabled: true });
    expect(
      Notifications.cancelAllScheduledNotificationsAsync,
    ).toHaveBeenCalledOnce();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("is a web no-op even with personal settings", async () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "web" });
    await resyncNotifications([jar()], { enabled: true });
    expect(
      Notifications.cancelAllScheduledNotificationsAsync,
    ).not.toHaveBeenCalled();
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
  });
  it("lets a disable supersede a rebuild waiting on the OS", async () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    });
    const scheduled: unknown[] = [];
    let releaseChannel!: () => void;
    const channelGate = new Promise<null>((resolve) => {
      releaseChannel = () => resolve(null);
    });
    vi.mocked(Notifications.setNotificationChannelAsync).mockReturnValueOnce(
      channelGate,
    );
    vi.mocked(
      Notifications.cancelAllScheduledNotificationsAsync,
    ).mockImplementation(async () => {
      scheduled.length = 0;
    });
    vi.mocked(Notifications.scheduleNotificationAsync).mockImplementation(
      async (request) => {
        scheduled.push(request);
        return "scheduled";
      },
    );

    const oldResync = resyncNotifications([jar()], { enabled: true });
    await vi.waitFor(() =>
      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledOnce(),
    );
    const disable = resyncNotifications([], { enabled: false });
    releaseChannel();
    await Promise.all([oldResync, disable]);

    expect(scheduled).toEqual([]);
    expect(
      Notifications.cancelAllScheduledNotificationsAsync,
    ).toHaveBeenCalledTimes(2);
  });

  it("does not touch OS notifications before both stores are ready", async () => {
    await resyncNotifications([jar()], { enabled: true, ready: false });
    expect(
      Notifications.cancelAllScheduledNotificationsAsync,
    ).not.toHaveBeenCalled();
  });

  it("reports native scheduling failures", async () => {
    const error = new Error("OS denied scheduling");
    vi.mocked(
      Notifications.cancelAllScheduledNotificationsAsync,
    ).mockRejectedValueOnce(error);

    await resyncNotifications([jar()], { enabled: false });

    expect(reportError).toHaveBeenCalledWith(error);
  });

  it("keeps permission request failures visible to the caller", async () => {
    const error = new Error("permission API failed");
    vi.mocked(Notifications.getPermissionsAsync).mockRejectedValueOnce(error);
    await expect(requestPermissionAndEnable()).rejects.toBe(error);
  });
});
