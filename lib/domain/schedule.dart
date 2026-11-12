/// Recurring-deposit scheduling for the Saving Jar domain.
///
/// A recurring rule has a computable nextDate and can be caught up
/// deterministically: every missed occurrence is applied exactly once, in
/// order, and `nextDate` always ends up in the future.
library;

import 'jar.dart';
import 'time.dart';

/// [from] advanced by one [cadence], walking the local calendar.
DateTime addCadence(DateTime from, String cadence) {
  switch (cadence) {
    case 'daily':
      return addCalendarDays(from, 1);
    case 'weekly':
      return addCalendarDays(from, 7);
    case 'biweekly':
      return addCalendarDays(from, 14);
    case 'monthly':
      // Keep the day-of-month, clamped to the target month's length.
      final day = from.day;
      final nextMonth = DateTime(from.year, from.month + 1, 1);
      final lastDay = DateTime(nextMonth.year, nextMonth.month + 1, 0).day;
      return DateTime(
        nextMonth.year,
        nextMonth.month,
        day.clamp(1, lastDay),
        from.hour,
        from.minute,
        from.second,
        from.millisecond,
      );
    default:
      return from;
  }
}

class RecurringRunResult {
  const RecurringRunResult({required this.jar, required this.applied});
  final Jar jar;
  final int applied;
}

/// Whether a rule has a supported cadence and a readable optional cursor.
bool hasValidRecurringSchedule(RecurringRule rule) =>
    cadences.contains(rule.cadence) &&
    (rule.nextDate == null || DateTime.tryParse(rule.nextDate!) != null);

/// Bring a jar's schedule up to date: apply every due recurring deposit and
/// advance nextDate past [now]. Bounded so a long-dormant schedule cannot loop
/// forever; at most 366 occurrences are applied per call.
RecurringRunResult runDueRecurring(Jar jar, [DateTime? now]) {
  final nowDate = now ?? DateTime.now();
  final rule = jar.recurring;
  if (jar.isArchived ||
      rule == null ||
      rule.paused ||
      !isSafeInteger(rule.amount) ||
      rule.amount <= 0 ||
      !hasValidRecurringSchedule(rule)) {
    return RecurringRunResult(jar: jar, applied: 0);
  }

  final created = DateTime.tryParse(jar.createdAt)?.toLocal();
  final due = DateTime.tryParse(rule.nextDate ?? jar.createdAt)?.toLocal();
  if (created == null || due == null) {
    return RecurringRunResult(jar: jar, applied: 0);
  }
  var current = jar;
  // Never look back further than the jar existed.
  var cursor = due.isBefore(created) ? created : due;

  var applied = 0;
  while (!cursor.isAfter(nowDate) && applied < 366) {
    final next = addCadence(cursor, rule.cadence);
    if (!next.isAfter(cursor)) break;
    final result = applyEntry(
      current,
      rule.amount,
      directionDeposit,
      note: 'Scheduled deposit',
      source: sourceRecurring,
      now: cursor,
    );
    if (result == null) break;
    current = result.jar;
    applied += 1;
    cursor = next;
  }

  if (applied == 0) return RecurringRunResult(jar: jar, applied: 0);

  return RecurringRunResult(
    jar: current.copyWith(recurring: rule.copyWith(nextDate: toIso(cursor))),
    applied: applied,
  );
}

/// Catch every jar up, refusing any jar whose update would push the active
/// total beyond the JSON-safe range.
List<Jar> runDueRecurringSafely(List<Jar> jars, DateTime now) {
  var total = 0;
  var changed = false;
  final next = jars.map((jar) {
    final updated = runDueRecurring(jar, now).jar;
    if (jar.isArchived) return updated;
    final nextTotal = total + updated.balance;
    if (!isSafeInteger(nextTotal)) return jar;
    total = nextTotal;
    if (!identical(jar, updated)) changed = true;
    return updated;
  }).toList();
  return changed ? next : jars;
}

/// What a recurring rule's next due date should become after an edit.
///
/// Preserve a future due date for an unchanged rule. New, changed, or overdue
/// rules begin one cadence after the edit so catch-up cannot replay history.
String? nextRecurringDate({
  RecurringRule? previous,
  required int amount,
  required String cadence,
  DateTime? now,
}) {
  final nowDate = now ?? DateTime.now();
  if (previous != null &&
      previous.amount == amount &&
      previous.cadence == cadence &&
      previous.nextDate != null &&
      DateTime.tryParse(previous.nextDate!)?.isAfter(nowDate) == true) {
    return previous.nextDate;
  }
  return toIso(addCadence(nowDate, cadence));
}

/// Weekly pace of a recurring rule in minor units, rounded. Paused or empty
/// rules pace zero.
int recurringPerWeek(RecurringRule? rule) {
  if (rule == null || rule.paused || !(rule.amount > 0)) return 0;
  switch (rule.cadence) {
    case 'daily':
      return rule.amount * 7;
    case 'weekly':
      return rule.amount;
    case 'biweekly':
      return mathRound(rule.amount / 2);
    case 'monthly':
      return mathRound((rule.amount * 12) / 52);
    default:
      return 0;
  }
}
