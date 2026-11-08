/// One in-app savings reminder per active, unfinished jar — the Home screen's
/// reminder rows. Works even where OS notifications cannot (e.g. web).
library;

import '../domain/insights.dart';
import '../domain/jar.dart';
import '../domain/money.dart';
import '../domain/reminder.dart';
import '../domain/time.dart';
import '../domain/util.dart';

int _nextReminderTime(Jar jar) {
  final rule = jar.recurring;
  final deposit = (rule != null && !rule.paused && rule.amount > 0)
      ? DateTime.tryParse(rule.nextDate ?? jar.createdAt)
            ?.millisecondsSinceEpoch
      : null;
  final deadline = jar.deadline != null
      ? parseDeadline(jar.deadline!)?.millisecondsSinceEpoch
      : null;
  return _min(deposit, deadline);
}

int _min(int? a, int? b) {
  if (a == null) return b ?? maxSafeInteger;
  if (b == null) return a;
  return a < b ? a : b;
}

class JarReminderRow {
  const JarReminderRow({
    required this.jar,
    required this.title,
    required this.detail,
  });
  final Jar jar;
  final String title;
  final String detail;
}

/// One savings reminder for each active, unfinished jar.
List<JarReminderRow> jarReminders(
  List<Jar> jars, [
  DateTime? now,
  String currency = 'USD',
]) {
  final nowDate = now ?? DateTime.now();
  final rows = jars
      .where((jar) => !jar.isArchived && jar.balance < jar.target)
      .toList();
  stableSort(
    rows,
    (a, b) => _nextReminderTime(a).compareTo(_nextReminderTime(b)),
  );
  return [for (final jar in rows) _buildRow(jar, nowDate, currency)];
}

JarReminderRow _buildRow(Jar jar, DateTime now, String currency) {
  final details = <String>[
    '${money(jar.target - jar.balance, currency)} left to save.',
  ];
  final reminder = jar.reminder;
  if (reminder != null) {
    final next = nextReminderDates(reminder, now).firstOrNull;
    if (!reminder.enabled) {
      details.add('Personal reminder: paused.');
    } else if (reminder.snoozedUntil != null &&
        DateTime.tryParse(reminder.snoozedUntil!) != null &&
        DateTime.parse(reminder.snoozedUntil!).toLocal().isAfter(now)) {
      details.add(
        'Personal reminder: snoozed until ${_toLocaleString(DateTime.parse(reminder.snoozedUntil!).toLocal())}.',
      );
    } else if (next != null) {
      details.add('Personal reminder: ${_toLocaleString(next)}.');
    }
  }
  final rule = jar.recurring;
  if (rule != null && !rule.paused && rule.amount > 0) {
    final due = parseIso(rule.nextDate ?? jar.createdAt);
    details.add(
      'Next deposit: ${money(rule.amount, currency)} on ${_toDateString(due)}.',
    );
  }
  final deadline = deadlineCountdown(jar.deadline, now);
  if (deadline != null) details.add('Deadline: $deadline.');
  return JarReminderRow(jar: jar, title: jar.name, detail: details.join('\n'));
}

/// Mirrors JS `toLocaleString()` reasonably: "11/8/2026, 9:00 AM".
String _toLocaleString(DateTime date) {
  final hour12 = date.hour % 12 == 0 ? 12 : date.hour % 12;
  final marker = date.hour < 12 ? 'AM' : 'PM';
  final minute = date.minute.toString().padLeft(2, '0');
  return '${date.month}/${date.day}/${date.year}, $hour12:$minute $marker';
}

/// Mirrors the RN app's "Nov 8, 2026" next-deposit rendering.
String _toDateString(DateTime date) {
  const monthShorts = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return '${monthShorts[date.month - 1]} ${date.day}, ${date.year}';
}
