import 'package:flutter_test/flutter_test.dart';
import 'package:jarly/domain/domain.dart';

import 'helpers.dart';

void main() {
  group('crossedMilestones', () {
    test('records every level crossed in one jump', () {
      final base = jar(milestonesHit: [25]);
      // 30 -> 80 of a 100.00 target crosses 50 and 75.
      expect(crossedMilestones(base, 8000), [50, 75]);
    });

    test('skips already-hit levels', () {
      expect(crossedMilestones(jar(milestonesHit: [25, 50]), 8000), [75]);
      expect(crossedMilestones(jar(), 2000), isEmpty);
    });

    test('never divides by a zero target', () {
      expect(crossedMilestones(jar(target: 0), 5000), isEmpty);
    });
  });

  group('applyEntry', () {
    test('rejects withdrawals above the balance without mutating state', () {
      final base = jar(balance: 5000);
      expect(applyEntry(base, 5001, directionWithdrawal), isNull);
    });

    test(
      'applies a valid withdrawal and never touches milestones or streaks',
      () {
        final base = jar(balance: 5000, kind: kindHabit, streak: 4);
        final result = applyEntry(base, 2000, directionWithdrawal);
        expect(result!.jar.balance, 3000);
        expect(result.reached, isEmpty);
        expect(result.jar.streak, 4);
        expect(result.jar.entries[0].direction, directionWithdrawal);
      },
    );

    test('rejects zero and negative amounts', () {
      expect(applyEntry(jar(), 0, directionDeposit), isNull);
      expect(applyEntry(jar(), -100, directionDeposit), isNull);
    });

    test('rejects deposits that would overflow the safe balance range', () {
      expect(
        applyEntry(jar(balance: maxSafeInteger), 1, directionDeposit),
        isNull,
      );
    });

    test('counts one milestone per deposit but records all crossed levels over time', () {
      var current = jar();
      final first = applyEntry(current, 2500, directionDeposit);
      expect(first!.reached, [25]);
      current = first.jar;
      final second = applyEntry(current, 5500, directionDeposit);
      expect(second!.reached, [50, 75]);
      expect(second.jar.milestonesHit, [25, 50, 75]);
    });
  });

  group('habit streaks', () {
    DateTime day(String iso) => DateTime.parse(iso).toLocal();

    test('starts at 1 on the first deposit', () {
      final result = applyEntry(
        jar(kind: kindHabit),
        1000,
        directionDeposit,
        source: sourceManual,
        now: day('2026-03-10T10:00:00Z'),
      );
      expect(result!.jar.streak, 1);
    });

    test('does not grow within the same day', () {
      final base = jar(
        kind: kindHabit,
        streak: 3,
        lastDepositAt: '2026-03-10T08:00:00Z',
      );
      final result = applyEntry(
        base,
        1000,
        directionDeposit,
        source: sourceManual,
        now: day('2026-03-10T20:00:00Z'),
      );
      expect(result!.jar.streak, 3);
    });

    test('grows on consecutive days and resets after a gap', () {
      final yesterday = jar(
        kind: kindHabit,
        streak: 3,
        lastDepositAt: '2026-03-09T20:00:00Z',
      );
      expect(
        applyEntry(
          yesterday,
          1000,
          directionDeposit,
          source: sourceManual,
          now: day('2026-03-10T09:00:00Z'),
        )!.jar.streak,
        4,
      );

      final stale = jar(
        kind: kindHabit,
        streak: 9,
        lastDepositAt: '2026-03-01T20:00:00Z',
      );
      expect(
        applyEntry(
          stale,
          1000,
          directionDeposit,
          source: sourceManual,
          now: day('2026-03-10T09:00:00Z'),
        )!.jar.streak,
        1,
      );
    });

    test('ignores goal jars entirely', () {
      final result = applyEntry(
        jar(kind: kindGoal, streak: 2),
        1000,
        directionDeposit,
        source: sourceManual,
        now: day('2026-03-10T10:00:00Z'),
      );
      expect(result!.jar.streak, 2);
      expect(result.jar.lastDepositAt, isNull);
    });
  });

  group('active jars exclude archived history', () {
    test('activeJars keeps only jars that are not archived', () {
      final active = jar();
      final archived = jar(id: 'old', archived: true);
      expect(
        activeJars([active, archived], (candidate) => candidate.isArchived),
        [active],
      );
      expect(
        activeJars([archived], (candidate) => candidate.isArchived),
        isEmpty,
      );
    });

    test('monthlyDeposits ignores deposits from archived jars', () {
      final archived = jar(
        archived: true,
        entries: [dep(5000, '2026-08-02T00:00:00.000Z', id: 'e1')],
      );
      final months = monthlyDeposits([archived], DateTime(2026, 8, 15));
      expect(months.every((month) => month.total == 0), isTrue);
    });

    test('badgeStats ignores archived jars entirely', () {
      final archived = jar(
        archived: true,
        balance: 10000,
        target: 10000,
        streak: 9,
        entries: [dep(5000, '2026-08-02T00:00:00.000Z', id: 'e1')],
      );
      final stats = badgeStats([archived]);
      expect(stats.deposits, 0);
      expect(stats.totalDeposited, 0);
      expect(stats.maxStreak, 0);
      expect(stats.completed, 0);
    });
  });

  group('jar serialization', () {
    test('round-trips through JSON with omitted optional fields', () {
      final base = jar(
        balance: 4000,
        entries: [
          applyEntry(
            jar(),
            4000,
            directionDeposit,
            now: DateTime.parse('2026-05-01T12:00:00Z'),
          )!.jar.entries.first,
        ],
      );
      final encoded = base.toJson();
      expect(encoded.containsKey('openingBalance'), isFalse);
      expect(encoded.containsKey('deadline'), isFalse);
      final decoded = Jar.fromJson(encoded);
      expect(decoded.id, base.id);
      expect(decoded.balance, base.balance);
      expect(decoded.entries.length, 1);
      expect(decoded.entries[0].id, base.entries[0].id);
      expect(decoded.entries[0].amount, 4000);
      expect(decoded.entries[0].note, isNull);
      expect(decoded.entries[0].toJson().containsKey('note'), isFalse);
    });

    test('normaliseJar derives opening balances and maps legacy accents', () {
      final normalised = normaliseJar({
        'id': 'legacy',
        'name': 'Legacy',
        'target': 10000,
        'balance': 5000,
        'accent': 'blue',
        'icon': 'flight',
        'entries': [
          {
            'id': 'e1',
            'amount': 5000,
            'direction': 'deposit',
            'at': '2026-01-02T00:00:00.000Z',
          },
        ],
      });
      expect(normalised.accent, 'ocean');
      expect(normalised.kind, kindGoal);
      expect(normalised.openingBalance, 0);
      expect(normalised.balance, 5000);

      final legacyScaled = normaliseJar({
        'id': 'old',
        'name': 'Old',
        'target': 100,
        'balance': 50.5,
        'accent': 'coral',
        'icon': 'x',
        'entries': [
          {
            'id': 'e1',
            'amount': 50.5,
            'direction': 'deposit',
            'at': '2026-01-02T00:00:00.000Z',
          },
        ],
      }, scaleToMinor: true);
      expect(legacyScaled.balance, 5050);
      expect(legacyScaled.target, 10000);
      expect(legacyScaled.entries[0].amount, 5050);
    });
  });
}
