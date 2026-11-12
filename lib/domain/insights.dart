/// Derived insights for the Saving Jar domain.
///
/// Everything here is pure: it takes jar data (and an injectable clock) and
/// returns data — callers format the words. Integer minor units throughout.
library;

import 'jar.dart';

import 'schedule.dart';
import 'time.dart';

class MonthTotal {
  MonthTotal({required this.label, required this.total});
  final String label;
  int total;
}

const List<String> _monthLabels = [
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

const List<String> _monthNames = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/// Deposit totals per calendar month for the last [count] months, oldest first.
List<MonthTotal> monthlyDeposits(
  List<Jar> jars, [
  DateTime? now,
  int count = 6,
]) {
  final nowDate = now ?? DateTime.now();
  final buckets = List.generate(count, (index) {
    final monthDate = DateTime(
      nowDate.year,
      nowDate.month - (count - 1 - index),
      1,
    );
    return MonthTotal(label: _monthLabels[monthDate.month - 1], total: 0);
  }, growable: false);
  for (final jar in jars) {
    // Archived jars are their own history section on the profile screen; the
    // insights chart reports on active saving only.
    if (jar.isArchived) continue;
    for (final entry in effectiveEntries(jar.entries)) {
      if (entry.direction != directionDeposit) continue;
      final at = parseIso(entry.at);
      final ago = (nowDate.year - at.year) * 12 + (nowDate.month - at.month);
      if (ago >= 0 && ago < buckets.length) {
        buckets[buckets.length - 1 - ago].total += entry.amount;
      }
    }
  }
  return buckets;
}

/// Parse an ISO or "Month Year" (end of that month) deadline. Null when unparseable.
DateTime? parseDeadline(String deadline) {
  final value = deadline.trim();
  final monthYear = RegExp(r'^([A-Za-z]+)\s+(\d{4})$').firstMatch(value);
  final month = monthYear != null
      ? _monthNames.indexOf(monthYear.group(1)!.toLowerCase())
      : -1;
  if (monthYear != null && month >= 0) {
    final year = int.parse(monthYear.group(2)!);
    // Day 0 of the following month is the month's last day, at local midnight.
    final endOfMonth = DateTime(year, month + 2, 0);
    return endOfMonth;
  }

  final dateOnly = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(value);
  if (dateOnly != null) {
    final year = int.parse(dateOnly.group(1)!);
    final monthNumber = int.parse(dateOnly.group(2)!);
    final dayNumber = int.parse(dateOnly.group(3)!);
    final localDate = DateTime(year, monthNumber, dayNumber);
    // Reject impossible dates: normalization would move the fields.
    if (localDate.year == year &&
        localDate.month == monthNumber &&
        localDate.day == dayNumber) {
      return localDate;
    }
    return null;
  }

  return DateTime.tryParse(value)?.toLocal();
}

const deadlineInputHelp =
    'Enter a date like 2026-12-31 or December 2026, or leave it blank.';

/// Optional jar deadlines use the existing 40-character transfer field.
bool isValidOptionalDeadline(String? value) =>
    value == null ||
    (value.length <= 40 &&
        (value.trim().isEmpty || parseDeadline(value) != null));

/// Human deadline chip. Returns a countdown ("12 days left") when the deadline
/// is parseable (ISO or "December 2026"), the original text otherwise.
/// Never relies on color alone — callers pair this with an icon.
String? deadlineCountdown(String? deadline, [DateTime? now]) {
  if (deadline == null) return null;
  final nowDate = now ?? DateTime.now();
  final date = parseDeadline(deadline);
  if (date == null) return deadline;
  final days = calendarDayNumber(date) - calendarDayNumber(nowDate);
  if (days < 0) return 'Past deadline';
  if (days == 0) return 'Due today';
  if (days == 1) return '1 day left';
  if (days <= 45) return '$days days left';
  return deadline;
}

/// Deadlines within two weeks read as urgent; meaning stays textual either way.
bool isUrgentDeadline(String? text) {
  if (text == null) return false;
  return RegExp(r'^(Due today|Past deadline|([1-9]|1[0-4]) days left)$')
      .hasMatch(text);
}

class MilestoneNudge<T> {
  const MilestoneNudge({
    required this.jar,
    required this.level,
    required this.gapMinor,
  });
  final T jar;
  final int level;
  final int gapMinor;
}

/// Smallest next-milestone money gap across jars, for the nudge row.
MilestoneNudge<T>? nextMilestoneNudge<T>(
  List<T> jars,
  int Function(T) target,
  int Function(T) balance,
) {
  MilestoneNudge<T>? best;
  for (final jar in jars) {
    if (target(jar) <= 0) continue;
    final ratio = (balance(jar) / target(jar)) * 100;
    final level = milestoneLevels.firstWhere(
      (candidate) => ratio < candidate,
      orElse: () => -1,
    );
    if (level < 0) continue;
    final gapMinor = mathRound((target(jar) * level) / 100) - balance(jar);
    if (gapMinor <= 0) continue;
    if (best == null || gapMinor < best.gapMinor) {
      best = MilestoneNudge(jar: jar, level: level, gapMinor: gapMinor);
    }
  }
  return best;
}

/// Deposit minor units across jars within the trailing [windowMs] ending at [now].
int depositTotalWithin(List<Jar> jars, int windowMs, [DateTime? now]) {
  final nowDate = now ?? DateTime.now();
  final since = nowDate.millisecondsSinceEpoch - windowMs;
  var total = 0;
  for (final jar in jars) {
    for (final entry in effectiveEntries(jar.entries)) {
      if (entry.direction != directionDeposit) continue;
      final at = parseIso(entry.at).millisecondsSinceEpoch;
      if (at >= since && at <= nowDate.millisecondsSinceEpoch) {
        total += entry.amount;
      }
    }
  }
  return total;
}

const int _weekMs = 7 * 86400000;

/// Total deposits made across jars during the trailing seven days.
int weeklyDelta(List<Jar> jars, [DateTime? now]) =>
    depositTotalWithin(jars, _weekMs, now);

const String paceFunded = 'funded';
const String paceNoDeadline = 'no-deadline';
const String paceNoPace = 'no-pace';
const String paceOnTrack = 'on-track';
const String paceBehind = 'behind';

class PaceProjection {
  const PaceProjection({
    required this.status,
    required this.requiredPerWeekMinor,
    required this.pacePerWeekMinor,
    this.projectedDate,
  });
  final String status;

  /// Minor units needed per week to hit the deadline. Zero when funded or dateless.
  final int requiredPerWeekMinor;

  /// Minor units per week of effective pace (best of recent deposits, recurring schedule).
  final int pacePerWeekMinor;

  /// ISO timestamp of the projected finish at current pace. Present for on-track/behind.
  final String? projectedDate;
}

/// Coach verdict for a dated jar: required-per-week vs. effective pace, where
/// pace is the best of trailing-28-day deposits and the recurring schedule.
/// Pure and integer-minor throughout; returns data, callers format the words.
PaceProjection paceProjection(Jar jar, [DateTime? now]) {
  final nowDate = now ?? DateTime.now();
  final remaining = jar.target - jar.balance;
  if (remaining <= 0) {
    return const PaceProjection(
      status: paceFunded,
      requiredPerWeekMinor: 0,
      pacePerWeekMinor: 0,
    );
  }
  if (jar.deadline == null) {
    return const PaceProjection(
      status: paceNoDeadline,
      requiredPerWeekMinor: 0,
      pacePerWeekMinor: 0,
    );
  }
  final date = parseDeadline(jar.deadline!);
  if (date == null) {
    return const PaceProjection(
      status: paceNoDeadline,
      requiredPerWeekMinor: 0,
      pacePerWeekMinor: 0,
    );
  }

  final daysLeft = BigInt.from(
    (calendarDayNumber(date) - calendarDayNumber(nowDate)).clamp(7, 1 << 40),
  );
  final requiredPerWeekMinor =
      ((BigInt.from(remaining) * BigInt.from(7) + daysLeft - BigInt.one) ~/
              daysLeft)
          .toInt();

  final cutoff = nowDate.millisecondsSinceEpoch - 28 * 86400000;
  var recent = 0;
  for (final entry in effectiveEntries(jar.entries)) {
    if (entry.direction != directionDeposit) continue;
    final at = parseIso(entry.at).millisecondsSinceEpoch;
    if (at >= cutoff && at <= nowDate.millisecondsSinceEpoch) {
      recent += entry.amount;
    }
  }
  final pacePerWeekMinor =
      mathRound(recent / 4) > recurringPerWeek(jar.recurring)
      ? mathRound(recent / 4)
      : recurringPerWeek(jar.recurring);
  if (pacePerWeekMinor <= 0) {
    return PaceProjection(
      status: paceNoPace,
      requiredPerWeekMinor: requiredPerWeekMinor,
      pacePerWeekMinor: 0,
    );
  }

  final projectedMs =
      nowDate.millisecondsSinceEpoch + (remaining / pacePerWeekMinor) * _weekMs;
  // JavaScript dates end at ±8.64e15 ms; a projection beyond that has no
  // representable finish date, exactly as in the original app.
  const double jsMaxMs = 8640000000000000;
  if (projectedMs.isNaN ||
      projectedMs.isInfinite ||
      projectedMs > jsMaxMs ||
      projectedMs < -jsMaxMs) {
    return PaceProjection(
      status: paceBehind,
      requiredPerWeekMinor: requiredPerWeekMinor,
      pacePerWeekMinor: pacePerWeekMinor,
    );
  }
  final projected = DateTime.fromMillisecondsSinceEpoch(projectedMs.round());
  final projectedDate = toIso(projected);
  // Day granularity: finishing on the deadline day itself counts as on-track,
  // so intraday clock time never flips the verdict.
  return PaceProjection(
    status: startOfDayMs(parseIso(projectedDate)) <= startOfDayMs(date)
        ? paceOnTrack
        : paceBehind,
    requiredPerWeekMinor: requiredPerWeekMinor,
    pacePerWeekMinor: pacePerWeekMinor,
    projectedDate: projectedDate,
  );
}
