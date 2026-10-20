import { describe, expect, it } from "vitest";

import { jarReminders } from "../lib/reminders";
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

describe("jarReminders", () => {
  it("shows the remaining amount for every unfinished jar without a schedule", () => {
    const reminders = jarReminders(
      [
        jar({ balance: 2500 }),
        jar({
          id: "clothes",
          name: "New clothes",
          balance: 1000,
          target: 5000,
        }),
      ],
      new Date(at),
    );
    expect(reminders.map(({ jar: goal }) => goal.id)).toEqual([
      "trip",
      "clothes",
    ]);
    expect(reminders[0].detail).toContain("75.00 left to save");
    expect(reminders[1].detail).toContain("40.00 left to save");
  });

  it("omits completed, overfunded, and archived jars", () => {
    expect(
      jarReminders(
        [
          jar({ balance: 10000 }),
          jar({ balance: 11000 }),
          jar({ archived: true }),
        ],
        new Date(at),
      ),
    ).toEqual([]);
  });

  it("shows a future recurring deposit even beyond tomorrow", () => {
    const scheduled = jar({
      recurring: {
        amount: 2500,
        cadence: "weekly",
        paused: false,
        nextDate: "2026-06-22T12:00:00.000Z",
      },
    });
    const [reminder] = jarReminders([scheduled], new Date(at));
    expect(reminder.title).toBe("Japan trip");
    expect(reminder.detail).toContain("25.00 on Jun 22, 2026");
  });

  it("shows deadlines even when they are more than three days away", () => {
    const [reminder] = jarReminders(
      [jar({ deadline: "2026-06-25" })],
      new Date(2026, 5, 15, 12),
    );
    expect(reminder.detail).toContain("10 days left");
  });

  it("reminds on the final day of a friendly month-year deadline", () => {
    const [reminder] = jarReminders(
      [jar({ deadline: "December 2026" })],
      new Date(2026, 11, 31, 12),
    );
    expect(reminder.detail).toContain("Due today");
  });

  it("keeps the savings reminder but omits paused deposits", () => {
    const paused = jar({
      recurring: {
        amount: 2500,
        cadence: "weekly",
        paused: true,
        nextDate: "2026-06-15T09:00:00.000Z",
      },
    });
    const [reminder] = jarReminders([paused], new Date(at));
    expect(reminder.detail).toContain("100.00 left to save");
    expect(reminder.detail).not.toContain("Next deposit");
  });

  it("uses the selected currency for remaining and scheduled amounts", () => {
    const [reminder] = jarReminders(
      [
        jar({
          recurring: {
            amount: 2500,
            cadence: "weekly",
            paused: false,
            nextDate: at,
          },
        }),
      ],
      new Date(at),
      "EGP",
    );
    expect(reminder.detail.match(/EGP/g)).toHaveLength(2);
  });

  it("returns no reminders when there are no jars", () => {
    expect(jarReminders([], new Date(at))).toEqual([]);
  });

  it("orders reminders by their earliest deposit or deadline, with undated jars last", () => {
    const jars = [
      jar({ id: "undated" }),
      jar({ id: "later", deadline: "2026-06-25" }),
      jar({
        id: "deposit",
        deadline: "2026-06-30",
        recurring: {
          amount: 2500,
          cadence: "weekly",
          paused: false,
          nextDate: "2026-06-16T12:00:00.000Z",
        },
      }),
      jar({ id: "overdue", deadline: "2026-06-14" }),
    ];
    expect(
      jarReminders(jars, new Date(at)).map(({ jar: goal }) => goal.id),
    ).toEqual(["overdue", "deposit", "later", "undated"]);
    expect(jars.map(({ id }) => id)).toEqual([
      "undated",
      "later",
      "deposit",
      "overdue",
    ]);
  });

  it("ignores paused schedules when ordering reminders and preserves undated order", () => {
    const reminders = jarReminders(
      [
        jar({ id: "unknown", deadline: "Someday" }),
        jar({
          id: "paused",
          recurring: {
            amount: 2500,
            cadence: "weekly",
            paused: true,
            nextDate: at,
          },
        }),
        jar({ id: "dated", deadline: "2026-07-01" }),
      ],
      new Date(at),
    );
    expect(reminders.map(({ jar: goal }) => goal.id)).toEqual([
      "dated",
      "unknown",
      "paused",
    ]);
  });

  it("separates remaining savings, next deposit, and deadline onto readable lines", () => {
    const [reminder] = jarReminders(
      [
        jar({
          deadline: "2026-06-25",
          recurring: {
            amount: 2500,
            cadence: "weekly",
            paused: false,
            nextDate: at,
          },
        }),
      ],
      new Date(2026, 5, 15, 12),
    );
    const lines = reminder.detail.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("100.00 left to save");
    expect(lines[1]).toContain("Next deposit:");
    expect(lines[2]).toBe("Deadline: 10 days left.");
  });
});
