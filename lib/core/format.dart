/// Locale-stable date rendering matching the original app's en-US output.
library;

import '../domain/domain.dart' show parseIso;

const List<String> _monthShorts = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/// "Nov 8, 2026" — JS toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'}).
String formatDate(DateTime date) =>
    '${_monthShorts[date.month - 1]} ${date.day}, ${date.year}';

/// "Nov 8" — JS {month:'short', day:'numeric'}.
String formatDayMonth(DateTime date) =>
    '${_monthShorts[date.month - 1]} ${date.day}';

/// "11/8/2026, 9:00 AM" — a stable stand-in for JS toLocaleString().
String formatDateTime(DateTime date) {
  final hour12 = date.hour % 12 == 0 ? 12 : date.hour % 12;
  final marker = date.hour < 12 ? 'AM' : 'PM';
  final minute = date.minute.toString().padLeft(2, '0');
  return '${date.month}/${date.day}/${date.year}, $hour12:$minute $marker';
}

/// "2026-11-08" local calendar date.
String localDateIso(DateTime date) =>
    '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

/// Parse an entry timestamp and render its local date.
String formatDateIso(String iso) => formatDate(parseIso(iso));
