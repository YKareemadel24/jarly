/// Pure derivation of schedulable notification nudges — the OS-agnostic half
/// of the original `lib/notifications.ts`. The platform service (phase 7)
/// feeds these to flutter_local_notifications.
library;

import '../domain/insights.dart';
import '../domain/jar.dart';
import '../domain/money.dart';
import '../domain/reminder.dart';
import '../domain/time.dart';

class DueNotification {
  const DueNotification({
    required this.jarId,
    required this.fireDate,
    required this.title,
    required this.detail,
  });
  final String jarId;
  final String fireDate;
  final String title;
  final String detail;
}

const int _dayMs = 86400000;

/// 09:00 local on the due day, or one minute from now when that has passed.
String _morningFire(DateTime due, DateTime now) {
  final fire = DateTime(due.year, due.month, due.day, 9, 0, 0);
  return toIso(fire.isAfter(now) ? fire : now.add(const Duration(minutes: 1)));
}

/// Schedulable nudges for active, unfinished jars. Home reminders also show
/// future schedules; OS deadline pings are due-day-only. Legacy jars get one
/// ping. Custom schedules share a finite queue fairly.
List<DueNotification> dueNotifications(List<Jar> jars, [DateTime? now, String currency = 'USD']) {
  final nowDate = now ?? DateTime.now();
  final queues = <List<DueNotification>>[];
  for (final jar in jars) {
    if (jar.isArchived) continue;
    if (jar.target > 0 && jar.balance >= jar.target) continue;

    if (jar.reminder != null) {
      queues.add([
        for (final date in nextReminderDates(jar.reminder!, nowDate, 63))
          DueNotification(
            jarId: jar.id,
            fireDate: toIso(date),
            title: '${jar.name} savings reminder',
            detail: 'A little more today goes a long way.',
          ),
      ]);
      continue;
    }

    final rule = jar.recurring;
    if (rule != null && !rule.paused && rule.amount > 0) {
      final due = rule.nextDate != null ? parseIso(rule.nextDate!) : parseIso(jar.createdAt);
      final days = ((due.millisecondsSinceEpoch - nowDate.millisecondsSinceEpoch) / _dayMs).ceil();
      if (days >= 0 && days <= 1) {
        queues.add([
          DueNotification(
            jarId: jar.id,
            fireDate: _morningFire(due, nowDate),
            title: '${jar.name} is scheduled',
            detail: '${money(rule.amount, currency)} due today.',
          ),
        ]);
        continue;
      }
    }

    if (jar.deadline != null) {
      final due = parseDeadline(jar.deadline!);
      if (due != null &&
          startOfDayMs(due) == startOfDayMs(nowDate)) {
        queues.add([
          DueNotification(
            jarId: jar.id,
            fireDate: _morningFire(due, nowDate),
            title: '${jar.name} is due today',
            detail: 'A little more today goes a long way.',
          ),
        ]);
      }
    }
  }
  // shortcut: the OS queue is finite; foreground resync replenishes upcoming dates.
  final pings = <DueNotification>[];
  for (var index = 0; index < 63 && pings.length < 63; index++) {
    var added = false;
    for (final queue in queues) {
      if (index < queue.length) {
        pings.add(queue[index]);
        added = true;
      }
      if (pings.length == 63) break;
    }
    if (!added) break;
  }
  return pings;
}
