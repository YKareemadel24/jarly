/// Activity feed grouping: transactions by day with jar/direction/range filters.
library;

import '../domain/jar.dart';
import '../domain/time.dart';
import '../domain/util.dart';

class ActivityRowData {
  const ActivityRowData({required this.entry, required this.jar});
  final Entry entry;
  final Jar jar;
}

class ActivitySection {
  const ActivitySection({required this.title, required this.data});
  final String title;
  final List<ActivityRowData> data;
}

class ActivityFilters {
  const ActivityFilters({this.jarId, this.direction, this.range});
  final String? jarId;

  /// "all" | "deposit" | "withdrawal"
  final String? direction;

  /// "all" | "7days" | "30days"
  final String? range;
}

String _dayLabel(String iso, DateTime now) {
  final date = parseIso(iso);
  final diffDays = calendarDayNumber(now) - calendarDayNumber(date);
  if (diffDays == 0) return 'Today';
  if (diffDays == 1) return 'Yesterday';
  if (diffDays < 7) return _weekdayName(date.weekday);
  final sameYear = date.year == now.year;
  final month = _monthShort(date.month);
  return sameYear ? '$month ${date.day}' : '$month ${date.day}, ${date.year}';
}

const List<String> _weekdayNames = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

String _weekdayName(int dartWeekday) => _weekdayNames[dartWeekday - 1];

const List<String> _monthShorts = [
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

String _monthShort(int dartMonth) => _monthShorts[dartMonth - 1];

List<ActivitySection> activitySections(
  List<Jar> jars, [
  DateTime? now,
  ActivityFilters filters = const ActivityFilters(),
]) {
  final nowDate = now ?? DateTime.now();
  final days = filters.range == '7days'
      ? 7
      : filters.range == '30days'
      ? 30
      : null;
  final since = days == null
      ? null
      : DateTime(
          nowDate.year,
          nowDate.month,
          nowDate.day - days + 1,
        ).millisecondsSinceEpoch;
  final until = DateTime(
    nowDate.year,
    nowDate.month,
    nowDate.day + 1,
  ).millisecondsSinceEpoch;
  final rows = [
    for (final jar in jars)
      if (!jar.isArchived && (filters.jarId == null || jar.id == filters.jarId))
        ...jar.entries.map((entry) => ActivityRowData(entry: entry, jar: jar)),
  ];
  rows.removeWhere((row) {
    if (filters.direction != null &&
        filters.direction != 'all' &&
        row.entry.direction != filters.direction) {
      return true;
    }
    final at = DateTime.tryParse(row.entry.at)?.millisecondsSinceEpoch;
    if (at == null) return true;
    return since != null && !(at >= since && at < until);
  });
  stableSort(rows, (a, b) {
    final atA = DateTime.parse(a.entry.at).millisecondsSinceEpoch;
    final atB = DateTime.parse(b.entry.at).millisecondsSinceEpoch;
    return atB.compareTo(atA);
  });
  final sections = <ActivitySection>[];
  for (final row in rows) {
    final title = _dayLabel(row.entry.at, nowDate);
    if (sections.isNotEmpty && sections.last.title == title) {
      sections.last.data.add(row);
    } else {
      sections.add(ActivitySection(title: title, data: [row]));
    }
  }
  return sections;
}
