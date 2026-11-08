/// Local-calendar date helpers shared by the domain.
///
/// JS `Date` semantics ported carefully: timestamps parse to local calendar
/// fields, serialization is always UTC ISO with millisecond precision, and day
/// arithmetic walks the local calendar so daylight-saving transitions behave
/// exactly as they did in the original app.
library;

/// Parse a timestamp string and localize it, mirroring JS `new Date(value)`
/// whose getters always read local calendar fields.
DateTime parseIso(String value) => DateTime.parse(value).toLocal();

/// Serialize as a UTC ISO string with millisecond precision, mirroring JS
/// `toISOString()`.
String toIso(DateTime value) => DateTime.fromMillisecondsSinceEpoch(
  value.millisecondsSinceEpoch,
  isUtc: true,
).toIso8601String();

/// Milliseconds since the local midnight that starts [value]'s calendar day.
int startOfDayMs(DateTime value) =>
    DateTime(value.year, value.month, value.day).millisecondsSinceEpoch;

/// Ordinal day number of [value]'s LOCAL calendar date, as if that date were a
/// UTC date. JS: `Date.UTC(y, m, d) / 86_400_000`.
int calendarDayNumber(DateTime value) =>
    DateTime.utc(value.year, value.month, value.day).millisecondsSinceEpoch ~/
    86400000;

/// Local day key `year-month-day` with a zero-based month, exactly as JS
/// template `${getFullYear()}-${getMonth()}-${getDate()}` produced.
String dayKey(DateTime value) =>
    '${value.year}-${value.month - 1}-${value.day}';

/// The local day key one calendar day before [key] (which is zero-based-month).
String previousDayKey(String key) {
  final parts = key.split('-').map(int.parse).toList();
  final date = DateTime(parts[0], parts[1] + 1, parts[2] - 1);
  return '${date.year}-${date.month - 1}-${date.day}';
}

/// [value] plus [days] calendar days, preserving wall-clock time so a DST
/// transition shifts the clock the way `setDate` did in JS.
DateTime addCalendarDays(DateTime value, int days) => DateTime(
  value.year,
  value.month,
  value.day + days,
  value.hour,
  value.minute,
  value.second,
  value.millisecond,
);
