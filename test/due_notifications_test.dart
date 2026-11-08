import 'package:flutter_test/flutter_test.dart';
import 'package:jarly/domain/domain.dart';
import 'package:jarly/notifications/due_notifications.dart';

import 'helpers.dart';

void main() {
  final at = DateTime(2026, 6, 15, 12);
  final atIso = toIso(at);

  group('dueNotifications', () {
    test('uses personal weekdays and snooze instead of legacy due pings', () {
      final now = DateTime(2026, 6, 15, 12);
      final custom = jar(
        deadline: '2026-06-15',
        reminder: JarReminder(
          enabled: true,
          hour: 18,
          minute: 30,
          weekdays: [1, 3],
          snoozedUntil: toIso(DateTime(2026, 6, 16, 12)),
        ),
      );
      final pings = dueNotifications([custom], now);
      expect(pings.length, greaterThan(2));
      final snoozeMs = DateTime.parse(custom.reminder!.snoozedUntil!).millisecondsSinceEpoch;
      expect(
        pings.every((ping) =>
            DateTime.parse(ping.fireDate).millisecondsSinceEpoch >= snoozeMs),
        isTrue,
      );
      expect(parseIso(pings[0].fireDate).weekday % 7, 3); // JS getDay(): Wednesday
      expect(parseIso(pings[0].fireDate).hour, 18);
      expect(
        dueNotifications(
          [custom.copyWith(reminder: custom.reminder!.copyWith(enabled: false))],
          now,
        ),
        isEmpty,
      );
    });

    test('shares at most 63 jar slots fairly and suppresses archived or funded personal reminders', () {
      final custom = jar(
        reminder: const JarReminder(
          enabled: true,
          hour: 18,
          minute: 0,
          weekdays: [0, 1, 2, 3, 4, 5, 6],
        ),
      );
      final pings = dueNotifications(
        [
          custom,
          custom.copyWith(id: 'b'),
          custom.copyWith(id: 'c'),
          custom.copyWith(id: 'archived', archived: true),
          custom.copyWith(id: 'complete', balance: custom.target),
        ],
        DateTime.parse(atIso),
      );
      expect(pings, hasLength(63));
      for (final id in ['trip', 'b', 'c']) {
        expect(pings.where((ping) => ping.jarId == id), hasLength(21));
      }
    });

    test('returns empty when nothing is due', () {
      expect(dueNotifications([jar()], DateTime.parse(atIso)), isEmpty);
    });

    test('schedules a morning ping for a recurring deposit due today', () {
      final scheduled = jar(
        recurring: const RecurringRule(
          amount: 2500,
          cadence: 'weekly',
          paused: false,
          nextDate: '2026-06-15T09:00:00.000Z',
        ),
      );
      final ping = dueNotifications([scheduled], DateTime.parse(atIso))[0];
      expect(ping.jarId, 'trip');
      expect(ping.title, contains('Japan trip'));
      expect(ping.detail, contains('due today'));
      expect(parseIso(ping.fireDate).day, 15);
    });

    test('prefers the recurring ping over the deadline ping for the same jar', () {
      final both = jar(
        deadline: '2026-06-15',
        recurring: const RecurringRule(
          amount: 2500,
          cadence: 'weekly',
          paused: false,
          nextDate: '2026-06-15T09:00:00.000Z',
        ),
      );
      expect(dueNotifications([both], DateTime.parse(atIso)), hasLength(1));
    });

    test('skips archived, funded, and paused jars', () {
      final jars = [
        jar(id: 'a', archived: true, deadline: '2026-06-15'),
        jar(id: 'b', balance: 10000, deadline: '2026-06-15'),
        jar(
          id: 'c',
          recurring: const RecurringRule(
            amount: 500,
            cadence: 'weekly',
            paused: true,
            nextDate: '2026-06-15T09:00:00.000Z',
          ),
        ),
      ];
      expect(dueNotifications(jars, DateTime.parse(atIso)), isEmpty);
    });

    test('schedules a due-day ping for a deadline with no schedule', () {
      final ping = dueNotifications(
        [jar(deadline: '2026-06-15')],
        DateTime.parse(atIso),
      )[0];
      expect(ping.title, contains('due today'));
    });

    test('skips zero-amount schedules, unparseable deadlines, and funded jars', () {
      final jars = [
        jar(
          id: 'z',
          recurring: const RecurringRule(
            amount: 0,
            cadence: 'weekly',
            paused: false,
            nextDate: '2026-06-15T09:00:00.000Z',
          ),
        ),
        jar(id: 'u', deadline: 'someday maybe'),
        jar(
          id: 'f',
          balance: 10000,
          recurring: const RecurringRule(
            amount: 2500,
            cadence: 'weekly',
            paused: false,
            nextDate: '2026-06-15T09:00:00.000Z',
          ),
        ),
      ];
      expect(dueNotifications(jars, DateTime.parse(atIso)), isEmpty);
    });

    test('schedules tomorrow-morning for a deposit due tomorrow', () {
      final scheduled = jar(
        recurring: const RecurringRule(
          amount: 2500,
          cadence: 'weekly',
          paused: false,
          nextDate: '2026-06-16T09:00:00.000Z',
        ),
      );
      final ping = dueNotifications([scheduled], DateTime.parse(atIso))[0];
      expect(parseIso(ping.fireDate).day, 16);
      expect(ping.detail, contains('due today'));
    });

    test('falls back to one minute out when the morning slot passed', () {
      final scheduled = jar(
        recurring: const RecurringRule(
          amount: 2500,
          cadence: 'weekly',
          paused: false,
          nextDate: '2026-06-15T09:00:00.000Z',
        ),
      );
      final ping = dueNotifications([scheduled], DateTime.parse(atIso))[0];
      final delta = DateTime.parse(ping.fireDate).millisecondsSinceEpoch -
          DateTime.parse(atIso).millisecondsSinceEpoch;
      expect(delta, greaterThan(0));
      expect(delta, lessThanOrEqualTo(5 * 60000));
    });
  });
}
