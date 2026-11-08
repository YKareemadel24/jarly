import 'package:flutter_test/flutter_test.dart';
import 'package:jarly/activity/activity_sections.dart';
import 'package:jarly/domain/domain.dart';

import 'helpers.dart';

void main() {
  group('activitySections', () {
    final now = DateTime(2026, 10, 22, 15);
    String localAt(int day, [int hour = 0, int minute = 0, int second = 0, int ms = 0]) =>
        toIso(DateTime(2026, 10, day, hour, minute, second, ms));
    List<String> ids(List<ActivitySection> sections) => sections
        .expand((section) => section.data.map((row) => row.entry.id))
        .toList();

    Entry entry(String id, String at, [String direction = directionDeposit]) =>
        Entry(id: id, amount: 500, direction: direction, at: at);

    test('combines jar, direction and range filters without archived history', () {
      final jars = [
        jar(entries: [
          entry('match', localAt(22), directionWithdrawal),
          entry('deposit', localAt(22)),
          entry('too-old', localAt(15), directionWithdrawal),
        ]),
        jar(
          id: 'other',
          entries: [entry('other-jar', localAt(22), directionWithdrawal)],
        ),
        jar(
          archived: true,
          entries: [entry('archived', localAt(22), directionWithdrawal)],
        ),
      ];
      expect(
        ids(activitySections(
          jars,
          now,
          const ActivityFilters(
            jarId: 'trip',
            direction: directionWithdrawal,
            range: '7days',
          ),
        )),
        ['match'],
      );
    });

    test('includes local midnight and all of today for 7days and 30days', () {
      // Negative day numbers wrap into September, mirroring the original suite.
      final cases = [
        ('7days', 16, 15),
        ('30days', -7, -8),
      ];
      for (final (range, firstDay, previousDay) in cases) {
        final jars = [
          jar(entries: [
            entry('before', localAt(previousDay, 23, 59, 59, 999)),
            entry('start', localAt(firstDay)),
            entry('tonight', localAt(22, 23, 59, 59, 999)),
            entry('tomorrow', localAt(23)),
          ]),
        ];
        expect(
          ids(activitySections(jars, now, ActivityFilters(range: range))),
          ['tonight', 'start'],
          reason: 'range $range',
        );
      }
    });

    test('returns no matches for a missing jar or unmatched direction', () {
      final jars = [jar(entries: [entry('deposit', localAt(22))])];
      expect(
        activitySections(jars, now, const ActivityFilters(jarId: 'missing')),
        isEmpty,
      );
      expect(
        activitySections(
            jars, now, const ActivityFilters(direction: directionWithdrawal)),
        isEmpty,
      );
    });

    test('keeps equal-time entries stable and all filters compatible with old callers', () {
      final jars = [
        jar(entries: [entry('first', localAt(22)), entry('second', localAt(22))]),
        jar(id: 'other', entries: [entry('third', localAt(22))]),
      ];
      expect(
        ids(activitySections(
          jars,
          now,
          const ActivityFilters(direction: 'all', range: 'all'),
        )),
        ['first', 'second', 'third'],
      );
      expect(
        ids(activitySections(jars, now, const ActivityFilters())),
        ['first', 'second', 'third'],
      );
      expect(activitySections([], now), isEmpty);
    });

    test('groups newest active transactions by local day and skips archived jars', () {
      final sections = activitySections(
        [
          jar(entries: [
            entry('old', '2026-06-14T10:00:00.000Z'),
            entry('today-first', '2026-06-15T09:00:00.000Z'),
          ]),
          jar(
            id: 'archived',
            archived: true,
            entries: [entry('hidden', '2026-06-15T11:00:00.000Z')],
          ),
          jar(
            id: 'home',
            name: 'Home',
            entries: [entry('today-last', '2026-06-15T11:00:00.000Z')],
          ),
        ],
        DateTime.parse('2026-06-15T12:00:00.000Z').toLocal(),
      );

      expect(sections.map((section) => section.title).toList(), [
        'Today',
        'Yesterday',
      ]);
      expect(
        sections[0].data.map((row) => row.entry.id).toList(),
        ['today-last', 'today-first'],
      );
      expect(sections[1].data[0].entry.id, 'old');
    });
  });
}
