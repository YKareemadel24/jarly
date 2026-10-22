import { describe, expect, it } from "vitest";
import {
  isValidJarReminder,
  nextReminderDates,
  snoozeReminderOneDay,
} from "../lib/domain/reminder";
import { type JarReminder } from "../lib/domain/jar";

const reminder: JarReminder = {
  enabled: true,
  hour: 18,
  minute: 30,
  weekdays: [1, 3, 5],
};

describe("personal reminder settings", () => {
  it("accepts 24-hour local times and unique Sunday-zero weekdays", () => {
    expect(isValidJarReminder(reminder)).toBe(true);
    expect(
      isValidJarReminder({
        ...reminder,
        enabled: false,
        hour: 0,
        minute: 0,
        weekdays: [0, 6],
      }),
    ).toBe(true);
    for (const patch of [
      { hour: 24 },
      { hour: -1 },
      { hour: 1.5 },
      { minute: 60 },
      { minute: NaN },
      { weekdays: [] },
      { weekdays: [7] },
      { weekdays: [1, 1] },
      { weekdays: Array(1) },
      { enabled: "yes" },
      { snoozedUntil: "tomorrow" },
    ]) {
      expect(isValidJarReminder({ ...reminder, ...patch })).toBe(false);
    }
    expect(isValidJarReminder(null)).toBe(false);
  });

  it("finds selected future local weekdays without mutating settings", () => {
    const now = new Date(2026, 5, 15, 18, 30);
    const dates = nextReminderDates(reminder, now, 4);
    expect(
      dates.map((date) => [date.getDate(), date.getHours(), date.getMinutes()]),
    ).toEqual([
      [17, 18, 30],
      [19, 18, 30],
      [22, 18, 30],
      [24, 18, 30],
    ]);
    expect(reminder.weekdays).toEqual([1, 3, 5]);
  });

  it("suppresses paused and snoozed occurrences even when the app stays closed", () => {
    const now = new Date(2026, 5, 15, 12);
    expect(nextReminderDates({ ...reminder, enabled: false }, now, 3)).toEqual(
      [],
    );
    const snoozed = {
      ...reminder,
      snoozedUntil: new Date(2026, 5, 18, 12).toISOString(),
    };
    expect(
      nextReminderDates(snoozed, now, 2).map((date) => date.getDate()),
    ).toEqual([19, 22]);
  });

  it("snoozes until the same local time tomorrow while preserving pause state", () => {
    const now = new Date(2026, 2, 7, 12, 15);
    const snoozed = snoozeReminderOneDay({ ...reminder, enabled: false }, now);
    expect(snoozed.enabled).toBe(false);
    const until = new Date(snoozed.snoozedUntil!);
    expect([until.getDate(), until.getHours(), until.getMinutes()]).toEqual([
      8, 12, 15,
    ]);
    expect(reminder.snoozedUntil).toBeUndefined();
  });

  it("keeps calendar time across the spring DST boundary", () => {
    const dates = nextReminderDates(
      { ...reminder, hour: 9, minute: 0, weekdays: [0, 1, 2, 3, 4, 5, 6] },
      new Date(2026, 2, 7, 8),
      4,
    );
    expect(dates.map((date) => [date.getDate(), date.getHours()])).toEqual([
      [7, 9],
      [8, 9],
      [9, 9],
      [10, 9],
    ]);
    const offsetChange =
      dates[0].getTimezoneOffset() - dates[1].getTimezoneOffset();
    expect(dates[1].getTime() - dates[0].getTime()).toBe(
      86_400_000 - offsetChange * 60_000,
    );
  });

  it("terminates safely at the last representable date", () => {
    expect(
      nextReminderDates(
        {
          ...reminder,
          snoozedUntil: new Date(8_640_000_000_000_000).toISOString(),
        },
        new Date(2026, 5, 15),
        3,
      ),
    ).toEqual([]);
  });

  it("keeps local time across the autumn DST boundary", () => {
    const dates = nextReminderDates(
      { ...reminder, hour: 9, minute: 0, weekdays: [0, 1, 2, 3, 4, 5, 6] },
      new Date(2026, 9, 31, 8),
      3,
    );
    expect(
      dates.map((date) => [date.getMonth(), date.getDate(), date.getHours()]),
    ).toEqual([
      [9, 31, 9],
      [10, 1, 9],
      [10, 2, 9],
    ]);
    const offsetChange =
      dates[0].getTimezoneOffset() - dates[1].getTimezoneOffset();
    expect(dates[1].getTime() - dates[0].getTime()).toBe(
      86_400_000 - offsetChange * 60_000,
    );
  });
});
