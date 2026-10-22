import { type JarReminder } from "./jar";

/** Stored reminder settings use local clock time and Sunday=0 weekdays. */
export function isValidJarReminder(value: unknown): value is JarReminder {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const reminder = value as JarReminder;
  return (
    typeof reminder.enabled === "boolean" &&
    Number.isInteger(reminder.hour) &&
    reminder.hour >= 0 &&
    reminder.hour <= 23 &&
    Number.isInteger(reminder.minute) &&
    reminder.minute >= 0 &&
    reminder.minute <= 59 &&
    Array.isArray(reminder.weekdays) &&
    reminder.weekdays.length > 0 &&
    reminder.weekdays.length <= 7 &&
    Array.from(reminder.weekdays).every(
      (day) => Number.isInteger(day) && day >= 0 && day <= 6,
    ) &&
    new Set(reminder.weekdays).size === reminder.weekdays.length &&
    (reminder.snoozedUntil === undefined ||
      (typeof reminder.snoozedUntil === "string" &&
        Number.isFinite(Date.parse(reminder.snoozedUntil)) &&
        new Date(reminder.snoozedUntil).toISOString() ===
          reminder.snoozedUntil))
  );
}

/** Future occurrences use calendar days so daylight-saving changes keep local time. */
export function nextReminderDates(
  reminder: JarReminder,
  now: Date = new Date(),
  count = 1,
): Date[] {
  if (
    !isValidJarReminder(reminder) ||
    !reminder.enabled ||
    !Number.isFinite(now.getTime())
  )
    return [];
  const start = new Date(
    Math.max(
      now.getTime(),
      reminder.snoozedUntil ? Date.parse(reminder.snoozedUntil) : 0,
    ),
  );
  const dates: Date[] = [];
  const limit = Math.min(63, Math.max(0, Math.floor(count)));
  for (
    let offset = 0;
    dates.length < limit && offset < limit * 7 + 8;
    offset++
  ) {
    const date = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + offset,
      reminder.hour,
      reminder.minute,
    );
    if (!Number.isFinite(date.getTime())) break;
    // A clock time skipped by a daylight-saving transition has no occurrence.
    if (
      date.getHours() !== reminder.hour ||
      date.getMinutes() !== reminder.minute
    )
      continue;
    if (
      date > now &&
      date >= start &&
      reminder.weekdays.includes(date.getDay())
    )
      dates.push(date);
  }
  return dates;
}

export function snoozeReminderOneDay(
  reminder: JarReminder,
  now: Date = new Date(),
): JarReminder {
  const until = new Date(now);
  until.setDate(until.getDate() + 1);
  return { ...reminder, snoozedUntil: until.toISOString() };
}
