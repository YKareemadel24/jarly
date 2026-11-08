import 'package:flutter_test/flutter_test.dart';
import 'package:jarly/activity/jar_reminders.dart';
import 'package:jarly/domain/domain.dart';

import 'helpers.dart';

void main() {
  final at = DateTime.parse('2026-06-15T12:00:00.000Z').toLocal();

  group('jarReminders', () {
    test('shows personal reminder state while keeping deposit schedules separate', () {
      final custom = jar(
        reminder: const JarReminder(enabled: false, hour: 18, minute: 30, weekdays: [1]),
      );
      expect(
        jarReminders([custom], at)[0].detail,
        contains('Personal reminder: paused'),
      );
      final snoozed = custom.copyWith(
        reminder: custom.reminder!.copyWith(
          enabled: true,
          snoozedUntil: '2026-06-17T12:00:00.000Z',
        ),
      );
      expect(
        jarReminders([snoozed], at)[0].detail,
        contains('Personal reminder: snoozed until'),
      );
    });

    test('shows the remaining amount for every unfinished jar without a schedule', () {
      final reminders = jarReminders(
        [
          jar(balance: 2500),
          jar(id: 'clothes', name: 'New clothes', balance: 1000, target: 5000),
        ],
        at,
      );
      expect(reminders.map((row) => row.jar.id).toList(), ['trip', 'clothes']);
      expect(reminders[0].detail, contains('75.00 left to save'));
      expect(reminders[1].detail, contains('40.00 left to save'));
    });

    test('omits completed, overfunded, and archived jars', () {
      expect(
        jarReminders(
          [
            jar(balance: 10000),
            jar(balance: 11000),
            jar(archived: true),
          ],
          at,
        ),
        isEmpty,
      );
    });

    test('shows a future recurring deposit even beyond tomorrow', () {
      final scheduled = jar(
        recurring: const RecurringRule(
          amount: 2500,
          cadence: 'weekly',
          paused: false,
          nextDate: '2026-06-22T12:00:00.000Z',
        ),
      );
      final reminder = jarReminders([scheduled], at)[0];
      expect(reminder.title, 'Japan trip');
      expect(reminder.detail, contains('25.00 on Jun 22, 2026'));
    });

    test('shows deadlines even when they are more than three days away', () {
      final reminder = jarReminders(
        [jar(deadline: '2026-06-25')],
        DateTime(2026, 6, 15, 12),
      )[0];
      expect(reminder.detail, contains('10 days left'));
    });

    test('reminds on the final day of a friendly month-year deadline', () {
      final reminder = jarReminders(
        [jar(deadline: 'December 2026')],
        DateTime(2026, 12, 31, 12),
      )[0];
      expect(reminder.detail, contains('Due today'));
    });

    test('keeps the savings reminder but omits paused deposits', () {
      final paused = jar(
        recurring: const RecurringRule(
          amount: 2500,
          cadence: 'weekly',
          paused: true,
          nextDate: '2026-06-15T09:00:00.000Z',
        ),
      );
      final reminder = jarReminders([paused], at)[0];
      expect(reminder.detail, contains('100.00 left to save'));
      expect(reminder.detail, isNot(contains('Next deposit')));
    });

    test('uses the selected currency for remaining and scheduled amounts', () {
      final reminder = jarReminders(
        [
          jar(
            recurring: const RecurringRule(
              amount: 2500,
              cadence: 'weekly',
              paused: false,
              nextDate: '2026-06-15T12:00:00.000Z',
            ),
          ),
        ],
        at,
        'EGP',
      )[0];
      expect(RegExp('EGP').allMatches(reminder.detail).length, 2);
    });

    test('returns no reminders when there are no jars', () {
      expect(jarReminders([], at), isEmpty);
    });

    test('orders reminders by their earliest deposit or deadline, with undated jars last', () {
      final jars = [
        jar(id: 'undated'),
        jar(id: 'later', deadline: '2026-06-25'),
        jar(
          id: 'deposit',
          deadline: '2026-06-30',
          recurring: const RecurringRule(
            amount: 2500,
            cadence: 'weekly',
            paused: false,
            nextDate: '2026-06-16T12:00:00.000Z',
          ),
        ),
        jar(id: 'overdue', deadline: '2026-06-14'),
      ];
      expect(
        jarReminders(jars, at).map((row) => row.jar.id).toList(),
        ['overdue', 'deposit', 'later', 'undated'],
      );
      expect(jars.map((candidate) => candidate.id).toList(), [
        'undated',
        'later',
        'deposit',
        'overdue',
      ]);
    });

    test('ignores paused schedules when ordering reminders and preserves undated order', () {
      final reminders = jarReminders(
        [
          jar(id: 'unknown', deadline: 'Someday'),
          jar(
            id: 'paused',
            recurring: const RecurringRule(
              amount: 2500,
              cadence: 'weekly',
              paused: true,
              nextDate: '2026-06-15T12:00:00.000Z',
            ),
          ),
          jar(id: 'dated', deadline: '2026-07-01'),
        ],
        at,
      );
      expect(reminders.map((row) => row.jar.id).toList(), [
        'dated',
        'unknown',
        'paused',
      ]);
    });

    test('separates remaining savings, next deposit, and deadline onto readable lines', () {
      final reminder = jarReminders(
        [
          jar(
            deadline: '2026-06-25',
            recurring: const RecurringRule(
              amount: 2500,
              cadence: 'weekly',
              paused: false,
              nextDate: '2026-06-15T12:00:00.000Z',
            ),
          ),
        ],
        DateTime(2026, 6, 15, 12),
      )[0];
      final lines = reminder.detail.split('\n');
      expect(lines, hasLength(3));
      expect(lines[0], contains('100.00 left to save'));
      expect(lines[1], contains('Next deposit:'));
      expect(lines[2], 'Deadline: 10 days left.');
    });
  });
}
