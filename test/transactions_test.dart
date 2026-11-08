import 'package:flutter_test/flutter_test.dart';
import 'package:jarly/domain/domain.dart';

import 'helpers.dart';

final DateTime now = DateTime.parse('2026-10-22T12:00:00Z').toLocal();

Jar empty({int? balance, String? kind}) => jar(
      name: 'Trip',
      target: 10000,
      balance: balance ?? 0,
      kind: kind ?? kindGoal,
      createdAt: '2026-10-01T12:00:00Z',
    );

Jar record(Jar base, int amount, String direction, int day) =>
    applyEntry(
      base,
      amount,
      direction,
      source: sourceManual,
      now: DateTime.parse('2026-10-$day T12:00:00Z'.replaceAll(' ', '')),
    )!
        .jar;

void main() {
  group('transaction corrections', () {
    test('updates balance and retains the previous amount, date and note', () {
      final base = record(empty(), 4000, directionDeposit, 18);
      final entry = base.entries[0];
      final corrected = correctEntry(
        base,
        entry.id,
        const EntryCorrection(
          amount: 6000,
          at: '2026-10-19T12:00:00Z',
          note: 'Correct amount',
        ),
        now,
      )!;
      expect(corrected.balance, 6000);
      expect(corrected.entries[0].id, entry.id);
      expect(corrected.entries[0].amount, 6000);
      expect(corrected.entries[0].note, 'Correct amount');
      expect(corrected.entries[0].revisions, hasLength(1));
      expect(corrected.entries[0].revisions![0].amount, 4000);
      expect(corrected.entries[0].revisions![0].at, entry.at);
      expect(corrected.entries[0].revisions![0].changedAt, toIso(now));
      expect(base.balance, 4000);
      expect(base.entries[0].revisions, isNull);
    });

    test('corrects a withdrawal without losing the opening balance of a legacy jar', () {
      final base = record(empty(balance: 5000), 2000, directionWithdrawal, 18);
      expect(
        correctEntry(
          base,
          base.entries[0].id,
          EntryCorrection(amount: 1000, at: base.entries[0].at),
          now,
        )!.balance,
        4000,
      );
    });

    test('rejects a correction that makes a past withdrawal impossible even if the current balance stays positive', () {
      var base = record(empty(), 10000, directionDeposit, 18);
      final id = base.entries[0].id;
      base = record(record(base, 8000, directionWithdrawal, 19), 10000, directionDeposit, 20);
      expect(
        correctEntry(
          base,
          id,
          const EntryCorrection(amount: 3000, at: '2026-10-18T12:00:00Z'),
          now,
        ),
        isNull,
      );
      expect(
        correctEntry(
          base,
          id,
          const EntryCorrection(amount: 10000, at: '2026-10-21T12:00:00Z'),
          now,
        ),
        isNull,
      );
    });

    test('rejects invalid correction amounts', () {
      final base = record(empty(), 1000, directionDeposit, 18);
      // Fractional amounts cannot be expressed in the typed Dart API, so the
      // runtime rejections cover zero, negative, and unsafe-integer values.
      for (final amount in [0, -1, maxSafeInteger + 1]) {
        expect(
          correctEntry(
            base,
            base.entries[0].id,
            EntryCorrection(amount: amount, at: base.entries[0].at),
            now,
          ),
          isNull,
        );
      }
    });

    test('rejects invalid or future dates', () {
      final base = record(empty(), 1000, directionDeposit, 18);
      for (final at in ['invalid', '2026-10-23T12:00:00Z']) {
        expect(
          correctEntry(
            base,
            base.entries[0].id,
            EntryCorrection(amount: 1000, at: at),
            now,
          ),
          isNull,
        );
      }
    });

    test('rebuilds habit streak metadata after changing a deposit date', () {
      var base = record(empty(kind: kindHabit), 1000, directionDeposit, 18);
      base = record(base, 1000, directionDeposit, 19);
      expect(base.streak, 2);
      final corrected = correctEntry(
        base,
        base.entries[0].id,
        const EntryCorrection(amount: 1000, at: '2026-10-21T12:00:00Z'),
        now,
      )!;
      expect(corrected.streak, 1);
      expect(corrected.lastDepositAt, '2026-10-21T12:00:00.000Z');
    });
  });

  group('transaction Undo', () {
    test('refuses Undo funded only by a future deposit', () {
      var base = record(empty(), 10000, directionDeposit, 19);
      final originalId = base.entries[0].id;
      base = record(record(base, 10000, directionWithdrawal, 20), 10000, directionDeposit, 23);
      expect(undoEntry(base, originalId, now), isNull);
    });

    test('refuses Undo before the original timestamp so saved audit links remain valid', () {
      final base = record(empty(), 1000, directionDeposit, 23);
      expect(undoEntry(base, base.entries[0].id, now), isNull);
    });

    test('allows note correction after Undo of an older deposit funded by later savings', () {
      var base = record(empty(), 10000, directionDeposit, 18);
      final originalId = base.entries[0].id;
      base = record(record(base, 10000, directionWithdrawal, 19), 10000, directionDeposit, 20);
      final later = base.entries[0];
      base = undoEntry(base, originalId, now)!;
      expect(base.balance, 0);
      final corrected = correctEntry(
        base,
        later.id,
        EntryCorrection(amount: later.amount, at: later.at, note: 'Later deposit'),
        now,
      );
      expect(corrected!.balance, 0);
      expect(
        corrected.entries.where((entry) => entry.id == later.id).first.note,
        'Later deposit',
      );
    });

    test('reverses a deposit with an audit link and prevents duplicate Undo or edits', () {
      final base = record(empty(), 3000, directionDeposit, 18);
      final id = base.entries[0].id;
      final undone = undoEntry(base, id, now)!;
      expect(undone.balance, 0);
      expect(undone.entries, hasLength(2));
      expect(undone.entries[0].direction, directionWithdrawal);
      expect(undone.entries[0].amount, 3000);
      expect(undone.entries[0].undoOf, id);
      expect(effectiveEntries(undone.entries), isEmpty);
      expect(weeklyDelta([undone], now), 0);
      expect(monthlyDeposits([undone], now, 1)[0].total, 0);
      expect(badgeStats([undone]).deposits, 0);
      expect(undoEntry(undone, id, now), isNull);
      expect(undoEntry(undone, undone.entries[0].id, now), isNull);
      expect(
        correctEntry(
          undone,
          id,
          EntryCorrection(amount: 4000, at: base.entries[0].at),
          now,
        ),
        isNull,
      );
    });

    test('reverses a withdrawal without awarding extra progress or habit days', () {
      var base = record(empty(kind: kindHabit), 5000, directionDeposit, 18);
      base = record(base, 2000, directionWithdrawal, 19);
      final undone = undoEntry(base, base.entries[0].id, now)!;
      expect(undone.balance, 5000);
      expect(undone.streak, 1);
      expect(undone.lastDepositAt, base.lastDepositAt);
      expect(undone.milestonesHit, base.milestonesHit);
      expect(effectiveEntries(undone.entries), hasLength(1));
    });

    test('rejects reversing a deposit when its money has since been withdrawn', () {
      final funded = record(empty(), 5000, directionDeposit, 18);
      final base = record(funded, 4000, directionWithdrawal, 19);
      expect(undoEntry(base, funded.entries[0].id, now), isNull);
    });
  });
}
