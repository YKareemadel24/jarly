/// Per-jar personal reminders: validation and future occurrence scheduling.
library;

import 'jar.dart';
import 'time.dart';

bool _isJsonInteger(Object? value) =>
    value is int || (value is double && value == value.roundToDouble());

int? _jsonInt(Object? value) =>
    _isJsonInteger(value) ? (value as num).toInt() : null;

/// Stored reminder settings use local clock time and Sunday=0 weekdays.
/// Accepts either a [JarReminder] or its raw JSON map so wire/storage
/// validation can reject malformed data before it is coerced.
bool isValidJarReminder(Object? value) {
  final Map<String, dynamic> raw;
  if (value is JarReminder) {
    raw = value.toJson();
  } else if (value is Map) {
    raw = value.cast<String, dynamic>();
  } else {
    return false;
  }
  final weekdays = raw['weekdays'];
  final snoozedUntil = raw['snoozedUntil'];
  final hour = _jsonInt(raw['hour']);
  final minute = _jsonInt(raw['minute']);
  return raw['enabled'] is bool &&
      hour != null &&
      hour >= 0 &&
      hour <= 23 &&
      minute != null &&
      minute >= 0 &&
      minute <= 59 &&
      weekdays is List &&
      weekdays.isNotEmpty &&
      weekdays.length <= 7 &&
      weekdays.every((day) {
        final parsed = _jsonInt(day);
        return parsed != null && parsed >= 0 && parsed <= 6;
      }) &&
      weekdays.toSet().length == weekdays.length &&
      (snoozedUntil == null ||
          (snoozedUntil is String &&
              DateTime.tryParse(snoozedUntil) != null &&
              toIso(DateTime.parse(snoozedUntil).toLocal()) == snoozedUntil));
}

/// Future occurrences use calendar days so daylight-saving changes keep local time.
List<DateTime> nextReminderDates(
  JarReminder reminder, [
  DateTime? now,
  int count = 1,
]) {
  final nowDate = now ?? DateTime.now();
  if (!isValidJarReminder(reminder) || !reminder.enabled) {
    return [];
  }
  var startMs = nowDate.millisecondsSinceEpoch;
  if (reminder.snoozedUntil != null) {
    final snoozedMs = DateTime.tryParse(reminder.snoozedUntil!)
        ?.millisecondsSinceEpoch;
    if (snoozedMs != null && snoozedMs > startMs) startMs = snoozedMs;
  }
  final start = DateTime.fromMillisecondsSinceEpoch(startMs);
  final dates = <DateTime>[];
  final limit = count < 0 ? 0 : (count > 63 ? 63 : count);
  for (
    var offset = 0;
    dates.length < limit && offset < limit * 7 + 8;
    offset++
  ) {
    final DateTime date;
    try {
      date = DateTime(
        start.year,
        start.month,
        start.day + offset,
        reminder.hour,
        reminder.minute,
      );
    } catch (_) {
      // Beyond the last representable date, exactly as in the original app.
      break;
    }
    if (date.millisecondsSinceEpoch > 8640000000000000 ||
        date.millisecondsSinceEpoch < -8640000000000000) {
      break;
    }
    // A clock time skipped by a daylight-saving transition has no occurrence.
    if (date.hour != reminder.hour || date.minute != reminder.minute) continue;
    // JS getDay(): Sunday = 0. Dart's weekday: Monday = 1 … Sunday = 7.
    final weekdaySunday0 = date.weekday % 7;
    if (date.isAfter(nowDate) &&
        !date.isBefore(start) &&
        reminder.weekdays.contains(weekdaySunday0)) {
      dates.add(date);
    }
  }
  return dates;
}

/// Push the reminder one calendar day forward from [now].
JarReminder snoozeReminderOneDay(JarReminder reminder, [DateTime? now]) {
  final until = addCalendarDays(now ?? DateTime.now(), 1);
  return reminder.copyWith(snoozedUntil: toIso(until));
}
