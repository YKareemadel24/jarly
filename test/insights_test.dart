import 'package:flutter_test/flutter_test.dart';
import 'package:jarly/domain/domain.dart';

import 'helpers.dart';

void main() {
  group('deadlineCountdown', () {
    final now = DateTime.parse('2026-08-24T00:00:00.000Z').toLocal();

    test('counts days for ISO deadlines', () {
      expect(deadlineCountdown('2026-08-24', now), 'Due today');
      expect(deadlineCountdown('2026-08-25', now), '1 day left');
      expect(deadlineCountdown('2026-09-10', now), '17 days left');
    });

    test('parses Month Year deadlines as the end of that month', () {
      // Far beyond 45 days, so the original friendly text passes through.
      expect(deadlineCountdown('December 2026', now), 'December 2026');
      final end = parseDeadline('December 2026');
      expect(end!.day, 31);
      expect(end.month, 12);
    });

    test('uses local calendar dates for date-only deadlines across DST', () {
      final due = parseDeadline('2026-03-09');
      expect([due!.year, due.month - 1, due.day, due.hour], [2026, 2, 9, 0]);
      expect(
        deadlineCountdown('2026-03-09', DateTime(2026, 3, 8, 23, 30)),
        '1 day left',
      );
    });

    test('counts friendly month deadlines to the last local calendar day', () {
      expect(
        deadlineCountdown('December 2026', DateTime(2026, 12, 30, 23, 30)),
        '1 day left',
      );
    });

    test('returns past-deadline and passthrough text safely', () {
      expect(deadlineCountdown('2026-01-01', now), 'Past deadline');
      expect(deadlineCountdown('someday maybe', now), 'someday maybe');
      expect(deadlineCountdown(null, now), isNull);
    });
  });

  group('weeklyDelta', () {
    final now = DateTime.parse('2026-08-24T12:00:00.000Z').toLocal();

    test('sums only deposits in the inclusive trailing seven-day window', () {
      expect(
        weeklyDelta(
          [
            jar(entries: [
              dep(2500, '2026-08-18T12:00:00.000Z', id: 'inside'),
              wdr(9999, '2026-08-20T12:00:00.000Z', id: 'withdrawal'),
            ]),
            jar(entries: [
              dep(500, '2026-08-24T12:00:00.000Z', id: 'now'),
              dep(7000, '2026-08-17T11:59:59.999Z', id: 'old'),
              dep(8000, '2026-08-24T12:00:00.001Z', id: 'future'),
            ]),
          ],
          now,
        ),
        3000,
      );
    });
  });

  group('monthlyDeposits', () {
    final now = DateTime(2026, 8, 15); // Aug 15, 2026
    Entry depAt(int amount, DateTime date) => Entry(
          id: 'e-$amount-${date.millisecondsSinceEpoch}',
          amount: amount,
          direction: directionDeposit,
          source: sourceManual,
          at: toIso(date),
        );

    test('buckets deposits into the last 6 months, oldest first, ignoring withdrawals and older entries', () {
      final j = jar(entries: [
        depAt(1000, DateTime(2026, 8, 2)),
        Entry(
          id: 'w1',
          amount: 500,
          direction: directionWithdrawal,
          source: sourceManual,
          at: toIso(DateTime(2026, 8, 3)),
        ),
        depAt(2000, DateTime(2026, 6, 20)),
        depAt(9999, DateTime(2026, 2, 28)),
      ]);
      final months = monthlyDeposits([j], now);
      expect(months, hasLength(6));
      expect(months[5].label, 'Aug');
      expect(months[5].total, 1000);
      expect(months[3].label, 'Jun');
      expect(months[3].total, 2000);
      expect(months.every((m) => m.label.length == 3), isTrue);
      // Feb deposit is outside the 6-month window.
      expect(months.fold<int>(0, (sum, m) => sum + m.total), 3000);
    });

    test('aggregates deposits across multiple jars', () {
      final a = jar(entries: [depAt(100, DateTime(2026, 8, 1))]);
      final b = jar(entries: [depAt(250, DateTime(2026, 8, 10))]);
      final last = monthlyDeposits([a, b], now).last;
      expect(last.label, 'Aug');
      expect(last.total, 350);
    });
  });

  group('weekly savings requirement', () {
    final now = DateTime(2026, 10, 22, 12);
    final base = jar(target: 8000, balance: 0, deadline: '2026-11-01');

    test('accounts for partial weeks instead of extending the deadline', () {
      expect(paceProjection(base, now).requiredPerWeekMinor, 5600);
    });

    test('rounds up by a minor unit without overflowing near the money limit', () {
      expect(
        paceProjection(
          jar(target: maxSafeInteger, balance: 0, deadline: '2026-11-05'),
          now,
        ).requiredPerWeekMinor,
        4503599627370496,
      );
    });

    test('limits the short-deadline requirement to the full amount remaining', () {
      expect(
        paceProjection(jar(target: 8000, balance: 0, deadline: '2026-10-25'), now)
            .requiredPerWeekMinor,
        8000,
      );
    });

    test('omits finish dates outside the supported date range', () {
      final projection = paceProjection(
        jar(
          target: 100000000000,
          balance: 2,
          deadline: '2026-11-01',
          entries: [dep(2, toIso(now), id: 'tiny')],
        ),
        now,
      );
      expect(projection.status, paceBehind);
      expect(projection.projectedDate, isNull);
    });
  });
}
