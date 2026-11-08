/// Achievement badges for the Saving Jar domain.
///
/// Every badge is earned from counters rolled up out of the jar list, so the
/// whole catalogue stays derivable — nothing is stored or mutated to earn one.
library;

import 'jar.dart';

class BadgeStats {
  const BadgeStats({
    required this.deposits,
    required this.totalDeposited,
    required this.maxStreak,
    required this.completed,
    required this.months,
  });

  /// Count of deposit entries across every jar.
  final int deposits;

  /// Integer minor units deposited across every jar.
  final int totalDeposited;

  /// Best habit streak on any jar.
  final int maxStreak;

  /// Jars that reached 100%.
  final int completed;

  /// Distinct calendar months with at least one deposit.
  final int months;
}

class Badge {
  const Badge({
    required this.id,
    required this.glyph,
    required this.name,
    required this.description,
    required this.value,
    required this.target,
    required this.earned,
  });

  final String id;
  final String glyph;
  final String name;
  final String description;

  /// Current progress toward [target], clamped for display.
  final int value;

  /// Requirement that earns the badge.
  final int target;
  final bool earned;
}

typedef BadgeMeasure = (int Function(BadgeStats), int);

class _BadgeSpec {
  const _BadgeSpec(this.id, this.glyph, this.name, this.description, this.of);
  final String id;
  final String glyph;
  final String name;
  final String description;
  final (int, int) Function(BadgeStats) of;
}

/// The full badge catalogue, in display order.
final List<_BadgeSpec> _badgeCatalogue = [
  _BadgeSpec('first-deposit', '🌱', 'First Light', 'Log your first deposit',
      (s) => (s.deposits, 1)),
  _BadgeSpec('ten-deposits', '✨', 'Getting Going', 'Log 10 deposits',
      (s) => (s.deposits, 10)),
  _BadgeSpec('fifty-deposits', '🧱', 'Brick by Brick', 'Log 50 deposits',
      (s) => (s.deposits, 50)),
  _BadgeSpec('hundred-deposits', '🏛️', 'Centurion', 'Log 100 deposits',
      (s) => (s.deposits, 100)),
  _BadgeSpec('streak-3', '🔥', 'Three in a Row', 'Reach a 3-day streak',
      (s) => (s.maxStreak, 3)),
  _BadgeSpec('streak-7', '📅', 'Week Strong', 'Reach a 7-day streak',
      (s) => (s.maxStreak, 7)),
  _BadgeSpec('streak-30', '🛡️', 'Iron Jar', 'Reach a 30-day streak',
      (s) => (s.maxStreak, 30)),
  _BadgeSpec('saved-100', '💯', 'First Hundred', 'Save 100.00 in total',
      (s) => (s.totalDeposited, 10000)),
  _BadgeSpec('saved-1000', '🏔️', 'Four Figures', 'Save 1,000.00 in total',
      (s) => (s.totalDeposited, 100000)),
  _BadgeSpec('first-goal', '🎯', 'Goal Smasher', 'Complete a jar',
      (s) => (s.completed, 1)),
  _BadgeSpec('steady-months', '🗓️', 'Steady Hand', 'Save in 4 different months',
      (s) => (s.months, 4)),
];

/// Roll a jar list up into the counters badges are earned from.
BadgeStats badgeStats(List<Jar> jars, [DateTime? now]) {
  final months = <String>{};
  var deposits = 0;
  var totalDeposited = 0;
  var maxStreak = 0;
  var completed = 0;

  for (final jar in jars) {
    // As with the monthly chart, archived jars no longer count toward active
    // progress: unarchiving is the way back in.
    if (jar.isArchived) continue;
    for (final entry in effectiveEntries(jar.entries)) {
      if (entry.direction != directionDeposit) continue;
      deposits += 1;
      totalDeposited += entry.amount;
      final at = DateTime.tryParse(entry.at);
      if (at != null) {
        months.add('${at.toLocal().year}-${at.toLocal().month - 1}');
      }
    }
    maxStreak = maxStreak > (jar.streak ?? 0) ? maxStreak : (jar.streak ?? 0);
    if (jar.target > 0 && jar.balance >= jar.target) completed += 1;
  }

  return BadgeStats(
    deposits: deposits,
    totalDeposited: totalDeposited,
    maxStreak: maxStreak,
    completed: completed,
    months: months.length,
  );
}

/// Every badge with its live progress, earned flags included. [now] is accepted
/// for symmetry and future time-boxed badges.
List<Badge> badges(List<Jar> jars, [DateTime? now]) {
  final stats = badgeStats(jars, now);
  return _badgeCatalogue.map((spec) {
    final (value, target) = spec.of(stats);
    return Badge(
      id: spec.id,
      glyph: spec.glyph,
      name: spec.name,
      description: spec.description,
      value: value < 0 ? 0 : value,
      target: target,
      earned: value >= target,
    );
  }).toList();
}

/// Badges present in [current] but absent from [previous] — the ones worth
/// celebrating. Pass the ids the user has already been shown as [previous].
List<Badge> newlyEarnedBadges(Iterable<String> previous, List<Badge> current) {
  final known = previous.toSet();
  return current.where((badge) => badge.earned && !known.contains(badge.id)).toList();
}
