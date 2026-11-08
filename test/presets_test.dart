import 'package:flutter_test/flutter_test.dart';
import 'package:jarly/domain/domain.dart';

import 'helpers.dart';

/// Fixed clock so pace windows and "recent" deposits are deterministic.
final DateTime now = DateTime.parse('2026-08-24T12:00:00.000Z').toLocal();

Entry dep(int amount, int daysAgo) => Entry(
  id: 'e-$amount-$daysAgo',
  amount: amount,
  direction: directionDeposit,
  source: sourceManual,
  at: toIso(now.subtract(Duration(milliseconds: daysAgo * 86400000))),
);

List<String> ids(List<QuickPreset> presets) =>
    presets.map((preset) => preset.id).toList();

int? amountOf(List<QuickPreset> presets, String id) =>
    presets.where((preset) => preset.id == id).firstOrNull?.amount;

void main() {
  group('quickPresets', () {
    test(
      'returns only positive integer minor amounts and never more than four',
      () {
        final presets = quickPresets(
          jar(balance: 3333, entries: [dep(1500, 3), dep(900, 10)]),
          now,
        );
        expect(presets.length, greaterThan(0));
        expect(presets.length, lessThanOrEqualTo(4));
        for (final preset in presets) {
          expect(preset.amount, isA<int>());
          expect(preset.amount, greaterThan(0));
        }
      },
    );

    test('rounds the balance up to the next clean step', () {
      // 33.33 -> next 5.00 boundary is 35.00.
      final presets = quickPresets(jar(balance: 3333), now);
      expect(amountOf(presets, presetRoundUp), 167);
    });

    test(
      'snaps a balance already on the boundary up a full step, never to zero',
      () {
        final presets = quickPresets(jar(balance: 5000), now);
        expect(amountOf(presets, presetRoundUp), 500);
      },
    );

    test('offers the exact gap to the next unreached milestone', () {
      // 30% of a 100.00 target -> 20.00 needed to reach 50%.
      final presets = quickPresets(
        jar(balance: 3000, target: 10000, milestonesHit: [25]),
        now,
      );
      expect(amountOf(presets, presetNextMilestone), 2000);

      // 80% -> next is 100%.
      final nearDone = quickPresets(
        jar(balance: 8000, target: 10000, milestonesHit: [25, 50, 75]),
        now,
      );
      expect(amountOf(nearDone, presetNextMilestone), 2000);
    });

    test('drops the milestone preset once every level is recorded', () {
      final funded = quickPresets(
        jar(balance: 10000, target: 10000, milestonesHit: [25, 50, 75, 100]),
        now,
      );
      expect(ids(funded), isNot(contains(presetNextMilestone)));
      expect(ids(funded), isNot(contains(presetWeeklyPace)));
    });

    test('never divides by a zero target', () {
      final presets = quickPresets(jar(target: 0, balance: 1200), now);
      expect(ids(presets), isNot(contains(presetNextMilestone)));
      for (final preset in presets) {
        expect(preset.amount, isA<int>());
      }
    });

    test('derives pace from trailing deposits and ignores stale ones', () {
      // 40.00 in the last 28 days -> 10.00/week; the 200.00 from 60 days ago is out of window.
      final presets = quickPresets(
        jar(balance: 0, entries: [dep(2500, 3), dep(1500, 20), dep(20000, 60)]),
        now,
      );
      expect(amountOf(presets, presetWeeklyPace), 1000);
    });

    test(
      'falls back to the recurring schedule when recent deposits are thin',
      () {
        // Weekly 12.00 recurring beats the 4.00/week trailing rate.
        final presets = quickPresets(
          jar(
            balance: 0,
            entries: [dep(1600, 5)],
            recurring: const RecurringRule(
              amount: 1200,
              cadence: 'weekly',
              paused: false,
            ),
          ),
          now,
        );
        expect(amountOf(presets, presetWeeklyPace), 1200);
      },
    );

    test('ignores a paused recurring schedule for pace', () {
      final presets = quickPresets(
        jar(
          balance: 0,
          recurring: const RecurringRule(
            amount: 1200,
            cadence: 'weekly',
            paused: true,
          ),
        ),
        now,
      );
      expect(ids(presets), isNot(contains(presetWeeklyPace)));
    });

    test('repeats the most recent deposit', () {
      // Entries are newest-first in the domain model.
      final presets = quickPresets(
        jar(balance: 500, entries: [dep(1500, 1), dep(700, 9)]),
        now,
      );
      expect(amountOf(presets, presetRepeatLast), 1500);
    });

    test('never suggests the same amount twice', () {
      final presets = quickPresets(
        jar(
          balance: 3000,
          target: 10000,
          milestonesHit: [25],
          entries: [dep(2000, 2)],
        ),
        now,
      );
      final amounts = presets.map((preset) => preset.amount).toList();
      expect(amounts.toSet().length, amounts.length);
    });

    test('returns an empty list for a jar with nothing to suggest', () {
      expect(quickPresets(jar(balance: 0, target: 0), now), isEmpty);
    });

    test('tolerates a future-dated entry without inflating pace', () {
      final presets = quickPresets(
        jar(balance: 0, entries: [dep(5000, -5)]),
        now,
      );
      expect(ids(presets), isNot(contains(presetWeeklyPace)));
    });
  });
}
