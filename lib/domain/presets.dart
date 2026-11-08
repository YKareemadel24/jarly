/// One-tap deposit suggestions derived entirely from the jar's own state.
///
/// Pure and integer-minor throughout; callers format the words. Equal amounts
/// collapse to their first suggestion, so a jar never shows two chips that
/// would deposit the same money.
library;

import 'jar.dart';
import 'money.dart';
import 'schedule.dart';
import 'time.dart';

const String presetRoundUp = 'round-up';
const String presetNextMilestone = 'next-milestone';
const String presetWeeklyPace = 'weekly-pace';
const String presetRepeatLast = 'repeat-last';

class QuickPreset {
  const QuickPreset({
    required this.id,
    required this.label,
    required this.hint,
    required this.amount,
  });

  final String id;

  /// Short primary label, e.g. "Hit 50%".
  final String label;

  /// One-line explanation of where the amount came from.
  final String hint;

  /// Integer minor units, always greater than zero.
  final int amount;
}

/// Step a round-up suggestion snaps the balance to, in minor units.
const int _roundUpStep = 500;

/// Largest round-up gap worth suggesting, so a chip never dwarfs the goal.
const int _roundUpCap = 20000;

/// Trailing window used to derive the jar's own saving pace.
const int _paceWindowMs = 28 * 86400000;

/// One-tap deposit suggestions derived entirely from the jar's own state: a
/// round-up, the exact gap to the next unreached milestone, the jar's own
/// recent pace, and a repeat of the last deposit. Equal amounts collapse to
/// their first suggestion, so a jar never shows two chips that would deposit
/// the same money.
List<QuickPreset> quickPresets(Jar jar, [DateTime? now, String currency = 'USD']) {
  final nowDate = now ?? DateTime.now();
  final suggestions = <QuickPreset>[];

  // 1. Neaten the balance up to the next clean step. An empty jar has nothing
  // to neaten, so it starts from the milestone or pace suggestion instead.
  final remainder = jar.balance.abs() % _roundUpStep;
  final roundUp = remainder == 0 ? _roundUpStep : _roundUpStep - remainder;
  if (jar.balance > 0 && roundUp > 0 && roundUp <= _roundUpCap) {
    suggestions.add(QuickPreset(
      id: presetRoundUp,
      label: 'Round to ${money(jar.balance + roundUp, currency)}',
      hint: 'Neaten the balance',
      amount: roundUp,
    ));
  }

  // 2. Land exactly on the next milestone this jar has not recorded yet.
  if (jar.target > 0) {
    final ratio = (jar.balance / jar.target) * 100;
    final level = milestoneLevels.firstWhere((candidate) => ratio < candidate, orElse: () => -1);
    if (level > 0) {
      final gap = mathRound((jar.target * level) / 100) - jar.balance;
      if (gap > 0) {
        suggestions.add(QuickPreset(
          id: presetNextMilestone,
          label: 'Hit $level%',
          hint: '${money(gap, currency)} to go',
          amount: gap,
        ));
      }
    }
  }

  // 3. The jar's own pace: trailing deposits, or its recurring schedule.
  var recent = 0;
  for (final entry in effectiveEntries(jar.entries)) {
    if (entry.direction != directionDeposit) continue;
    final at = parseIso(entry.at).millisecondsSinceEpoch;
    if (at >= nowDate.millisecondsSinceEpoch - _paceWindowMs &&
        at <= nowDate.millisecondsSinceEpoch) {
      recent += entry.amount;
    }
  }
  final recentPace = mathRound(recent / 4);
  final pace = recentPace > recurringPerWeek(jar.recurring)
      ? recentPace
      : recurringPerWeek(jar.recurring);
  if (pace > 0) {
    suggestions.add(QuickPreset(
      id: presetWeeklyPace,
      label: 'Your weekly pace',
      hint: '${money(pace, currency)} per week',
      amount: pace,
    ));
  }

  // 4. Repeat whatever was last added. Newest entries come first.
  for (final entry in effectiveEntries(jar.entries)) {
    if (entry.direction != directionDeposit) continue;
    suggestions.add(QuickPreset(
      id: presetRepeatLast,
      label: 'Repeat last',
      hint: money(entry.amount, currency),
      amount: entry.amount,
    ));
    break;
  }

  final seen = <int>{};
  return suggestions
      .where((preset) {
        if (!isSafeInteger(preset.amount) || preset.amount <= 0) return false;
        if (seen.contains(preset.amount)) return false;
        seen.add(preset.amount);
        return true;
      })
      .take(4)
      .toList();
}
