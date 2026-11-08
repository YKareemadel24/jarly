import 'package:flutter_test/flutter_test.dart';
import 'package:jarly/domain/domain.dart';

import 'helpers.dart';

List<String> earnedIds(List<Badge> list) =>
    list.where((badge) => badge.earned).map((badge) => badge.id).toList();

Badge find(List<Badge> list, String id) =>
    list.where((badge) => badge.id == id).first;

void main() {
  group('badgeStats', () {
    test('counts deposits and minor units across every jar', () {
      final stats = badgeStats([
        jar(entries: [
          dep(1000, '2026-03-01T00:00:00Z'),
          dep(2500, '2026-03-02T00:00:00Z'),
        ]),
        jar(id: 'b', entries: [dep(500, '2026-04-01T00:00:00Z')]),
      ]);
      expect(stats.deposits, 3);
      expect(stats.totalDeposited, 4000);
    });

    test('ignores withdrawals for counts, totals, and month coverage', () {
      final stats = badgeStats([
        jar(entries: [
          dep(1000, '2026-03-01T00:00:00Z'),
          wdr(400, '2026-05-01T00:00:00Z', id: 'w1'),
        ]),
      ]);
      expect(stats.deposits, 1);
      expect(stats.totalDeposited, 1000);
      expect(stats.months, 1);
    });

    test('counts distinct calendar months, not deposits', () {
      final stats = badgeStats([
        jar(entries: [
          dep(100, '2026-03-01T00:00:00Z'),
          dep(100, '2026-03-20T00:00:00Z'),
          dep(100, '2026-04-05T00:00:00Z'),
        ]),
      ]);
      expect(stats.months, 2);
    });

    test('takes the best streak across jars', () {
      expect(
        badgeStats([
          jar(streak: 3),
          jar(id: 'b', streak: 11),
          jar(id: 'c'),
        ]).maxStreak,
        11,
      );
    });

    test('counts only funded jars as completed', () {
      final stats = badgeStats([
        jar(balance: 10000, target: 10000),
        jar(id: 'b', balance: 9999, target: 10000),
        jar(id: 'c', balance: 0, target: 0),
      ]);
      expect(stats.completed, 1);
    });

    test('tolerates an unparseable entry date without inflating months', () {
      final stats = badgeStats([jar(entries: [dep(500, 'not-a-date')])]);
      expect(stats.deposits, 1);
      expect(stats.months, 0);
    });

    test('returns zeroed stats for an empty list', () {
      final stats = badgeStats([]);
      expect(stats.deposits, 0);
      expect(stats.totalDeposited, 0);
      expect(stats.maxStreak, 0);
      expect(stats.completed, 0);
      expect(stats.months, 0);
    });
  });

  group('badges', () {
    test('returns the full catalogue in a stable order with progress', () {
      final list = badges([jar()]);
      expect(list, hasLength(11));
      expect(list.map((badge) => badge.id).toList(), [
        'first-deposit',
        'ten-deposits',
        'fifty-deposits',
        'hundred-deposits',
        'streak-3',
        'streak-7',
        'streak-30',
        'saved-100',
        'saved-1000',
        'first-goal',
        'steady-months',
      ]);
    });

    test('earns nothing for a brand-new jar', () {
      expect(earnedIds(badges([jar()])), isEmpty);
      for (final badge in badges([jar()])) {
        expect(badge.earned, isFalse);
        expect(badge.value, 0);
      }
    });

    test('earns the first-deposit badge on a single contribution', () {
      final list = badges([
        jar(entries: [dep(1000, '2026-03-01T00:00:00Z')]),
      ]);
      expect(find(list, 'first-deposit').earned, isTrue);
      expect(find(list, 'ten-deposits').earned, isFalse);
      expect(find(list, 'ten-deposits').value, 1);
    });

    test('earns money badges at the exact minor-unit threshold', () {
      final under = badges([
        jar(entries: [dep(9999, '2026-03-01T00:00:00Z')]),
      ]);
      expect(find(under, 'saved-100').earned, isFalse);

      final exact = badges([
        jar(entries: [dep(10000, '2026-03-01T00:00:00Z')]),
      ]);
      expect(find(exact, 'saved-100').earned, isTrue);
      expect(find(exact, 'saved-1000').earned, isFalse);
    });

    test('earns streak badges from the best streak', () {
      final list = badges([jar(kind: kindHabit, streak: 7)]);
      expect(earnedIds(list), containsAll(['streak-3', 'streak-7']));
      expect(find(list, 'streak-30').earned, isFalse);
      expect(find(list, 'streak-30').value, 7);
    });

    test('earns the completion badge only when a jar is fully funded', () {
      expect(
        find(badges([jar(balance: 9999, target: 10000)]), 'first-goal').earned,
        isFalse,
      );
      expect(
        find(badges([jar(balance: 10000, target: 10000)]), 'first-goal').earned,
        isTrue,
      );
    });

    test('earns the months badge at four distinct months', () {
      final three = badges([
        jar(entries: [
          dep(1, '2026-01-01T00:00:00Z'),
          dep(1, '2026-02-01T00:00:00Z'),
          dep(1, '2026-03-01T00:00:00Z'),
        ]),
      ]);
      expect(find(three, 'steady-months').earned, isFalse);
      expect(find(three, 'steady-months').value, 3);

      final four = badges([
        jar(entries: [
          dep(1, '2026-01-01T00:00:00Z'),
          dep(1, '2026-02-01T00:00:00Z'),
          dep(1, '2026-03-01T00:00:00Z'),
          dep(1, '2026-04-01T00:00:00Z'),
        ]),
      ]);
      expect(find(four, 'steady-months').earned, isTrue);
    });

    test('never reports negative progress', () {
      for (final badge in badges([jar(streak: 0, entries: [])])) {
        expect(badge.value, greaterThanOrEqualTo(0));
      }
    });
  });

  group('newlyEarnedBadges', () {
    test('returns only badges absent from the seen list', () {
      final list = badges([
        jar(entries: [dep(10000, '2026-03-01T00:00:00Z')]),
      ]);
      final fresh = newlyEarnedBadges([], list).map((badge) => badge.id).toList();
      expect(fresh, containsAll(['first-deposit', 'saved-100']));

      const seen = ['first-deposit', 'saved-100'];
      expect(newlyEarnedBadges(seen, list), isEmpty);
    });

    test('never reports an unearned badge', () {
      expect(newlyEarnedBadges([], badges([jar()])), isEmpty);
    });
  });
}
