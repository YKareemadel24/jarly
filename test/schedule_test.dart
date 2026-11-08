import 'package:flutter_test/flutter_test.dart';
import 'package:jarly/domain/domain.dart';

import 'helpers.dart';

void main() {
  group('runDueRecurring', () {
    test(
      'applies each missed occurrence once and advances nextDate past now',
      () {
        final weekly = jar(
          createdAt: '2026-06-01T00:00:00.000Z',
          recurring: const RecurringRule(
            amount: 500,
            cadence: 'weekly',
            paused: false,
          ),
        );
        final now = DateTime.parse('2026-06-16T00:00:00.000Z').toLocal();
        final result = runDueRecurring(weekly, now);
        // Due on Jun 1, 8, 15 -> three deposits; next due Jun 22.
        expect(result.applied, 3);
        expect(result.jar.balance, 1500);
        expect(
          parseIso(result.jar.recurring!.nextDate!).toUtc().toIso8601String(),
          '2026-06-22T00:00:00.000Z',
        );
        expect(
          result.jar.entries.where((entry) => entry.source == sourceRecurring),
          hasLength(3),
        );
      },
    );

    test('does nothing when paused or when nothing is due', () {
      final paused = jar(
        recurring: const RecurringRule(
          amount: 500,
          cadence: 'daily',
          paused: true,
        ),
      );
      expect(
        runDueRecurring(
          paused,
          DateTime.parse('2027-01-01T00:00:00.000Z'),
        ).applied,
        0,
      );

      final future = jar(
        createdAt: '2026-01-01T00:00:00.000Z',
        recurring: const RecurringRule(
          amount: 500,
          cadence: 'weekly',
          paused: false,
          nextDate: '2099-01-01T00:00:00.000Z',
        ),
      );
      expect(
        runDueRecurring(
          future,
          DateTime.parse('2026-06-01T00:00:00.000Z'),
        ).applied,
        0,
      );
    });

    test('advances monthly schedules by calendar month', () {
      final monthly = jar(
        createdAt: '2026-01-31T00:00:00.000Z',
        recurring: const RecurringRule(
          amount: 1200,
          cadence: 'monthly',
          paused: false,
        ),
      );
      final result = runDueRecurring(
        monthly,
        DateTime.parse('2026-03-15T00:00:00.000Z'),
      );
      // Jan 31 and Feb 28 (clamped) are both due by Mar 15.
      expect(result.applied, 2);
      expect(result.jar.balance, 2400);
      expect(result.jar.entries.map((entry) => entry.at).toList(), [
        '2026-02-28T00:00:00.000Z',
        '2026-01-31T00:00:00.000Z',
      ]);
    });

    test(
      'keeps the first unapplied occurrence when catch-up reaches its cap',
      () {
        final daily = jar(
          createdAt: '2024-01-01T00:00:00.000Z',
          recurring: const RecurringRule(
            amount: 1,
            cadence: 'daily',
            paused: false,
          ),
        );
        final now = DateTime.parse('2025-01-02T00:00:00.000Z');
        final first = runDueRecurring(daily, now);
        final second = runDueRecurring(first.jar, now);
        expect(first.applied, 366);
        expect(first.jar.recurring!.nextDate, '2025-01-01T00:00:00.000Z');
        expect(first.applied + second.applied, 368);
        expect(second.jar.balance, 368);
      },
    );

    test('skips recurring catch-up that would overflow the active total', () {
      final nearLimit = jar(id: 'near', balance: maxSafeInteger - 500);
      final due = jar(
        id: 'due',
        recurring: const RecurringRule(
          amount: 1000,
          cadence: 'daily',
          paused: false,
        ),
      );
      expect(runDueRecurringSafely([nearLimit, due], DateTime(2026, 1, 2)), [
        nearLimit,
        due,
      ]);
    });
  });

  group('nextRecurringDate', () {
    final now = DateTime.parse('2026-06-15T12:00:00.000Z').toLocal();

    test('keeps a still-future date when amount and cadence are unchanged', () {
      const previous = RecurringRule(
        amount: 500,
        cadence: 'weekly',
        paused: false,
        nextDate: '2026-06-20T12:00:00.000Z',
      );
      expect(
        nextRecurringDate(
          previous: previous,
          amount: 500,
          cadence: 'weekly',
          now: now,
        ),
        '2026-06-20T12:00:00.000Z',
      );
    });

    test('starts a changed schedule at its next occurrence after now', () {
      const previous = RecurringRule(
        amount: 500,
        cadence: 'weekly',
        paused: false,
        nextDate: '2026-06-20T12:00:00.000Z',
      );
      expect(
        nextRecurringDate(
          previous: previous,
          amount: 700,
          cadence: 'weekly',
          now: now,
        ),
        '2026-06-22T12:00:00.000Z',
      );
      expect(
        nextRecurringDate(
          previous: previous,
          amount: 500,
          cadence: 'monthly',
          now: now,
        ),
        '2026-07-15T12:00:00.000Z',
      );
    });

    test('does not replay overdue occurrences after rescheduling', () {
      const previous = RecurringRule(
        amount: 500,
        cadence: 'weekly',
        paused: false,
        nextDate: '2026-06-01T12:00:00.000Z',
      );
      expect(
        nextRecurringDate(
          previous: previous,
          amount: 500,
          cadence: 'weekly',
          now: now,
        ),
        '2026-06-22T12:00:00.000Z',
      );
    });

    test('starts a new schedule at its next occurrence', () {
      expect(
        nextRecurringDate(amount: 500, cadence: 'weekly', now: now),
        '2026-06-22T12:00:00.000Z',
      );
    });
  });
}
