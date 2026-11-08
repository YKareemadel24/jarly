import 'package:flutter_test/flutter_test.dart';
import 'package:jarly/domain/domain.dart';

void main() {
  const reminder = JarReminder(
    enabled: true,
    hour: 18,
    minute: 30,
    weekdays: [1, 3, 5],
  );

  group('personal reminder settings', () {
    test('accepts 24-hour local times and unique Sunday-zero weekdays', () {
      expect(isValidJarReminder(reminder), isTrue);
      expect(
        isValidJarReminder(
          reminder.copyWith(
            enabled: false,
            hour: 0,
            minute: 0,
            weekdays: [0, 6],
          ),
        ),
        isTrue,
      );
      for (final patch in [
        const JarReminder(
          enabled: true,
          hour: 24,
          minute: 30,
          weekdays: [1, 3, 5],
        ),
        const JarReminder(
          enabled: true,
          hour: -1,
          minute: 30,
          weekdays: [1, 3, 5],
        ),
        const JarReminder(
          enabled: true,
          hour: 18,
          minute: 60,
          weekdays: [1, 3, 5],
        ),
        const JarReminder(enabled: true, hour: 18, minute: 30, weekdays: []),
        const JarReminder(enabled: true, hour: 18, minute: 30, weekdays: [7]),
        const JarReminder(
          enabled: true,
          hour: 18,
          minute: 30,
          weekdays: [1, 1],
        ),
      ]) {
        expect(
          isValidJarReminder(patch),
          isFalse,
          reason: 'should reject $patch',
        );
      }
      // Raw wire/storage shapes must be validated before coercion, so a
      // string "yes" for enabled is rejected the way the original app did.
      expect(
        isValidJarReminder({
          'enabled': 'yes',
          'hour': 18,
          'minute': 30,
          'weekdays': [1, 3, 5],
        }),
        isFalse,
      );
      expect(isValidJarReminder(null), isFalse);
    });

    test('rejects a non-ISO snooze stamp', () {
      expect(
        isValidJarReminder(reminder.copyWith(snoozedUntil: 'tomorrow')),
        isFalse,
      );
    });

    test('finds selected future local weekdays without mutating settings', () {
      final now = DateTime(2026, 6, 15, 18, 30);
      final dates = nextReminderDates(reminder, now, 4);
      expect(dates.map((date) => [date.day, date.hour, date.minute]).toList(), [
        [17, 18, 30],
        [19, 18, 30],
        [22, 18, 30],
        [24, 18, 30],
      ]);
      expect(reminder.weekdays, [1, 3, 5]);
    });

    test('suppresses paused and snoozed occurrences even when the app stays closed', () {
      final now = DateTime(2026, 6, 15, 12);
      expect(
        nextReminderDates(reminder.copyWith(enabled: false), now, 3),
        isEmpty,
      );
      final snoozed = reminder.copyWith(
        snoozedUntil: toIso(DateTime(2026, 6, 18, 12)),
      );
      expect(
        nextReminderDates(snoozed, now, 2).map((date) => date.day).toList(),
        [19, 22],
      );
    });

    test(
      'snoozes until the same local time tomorrow while preserving pause state',
      () {
        final now = DateTime(2026, 3, 7, 12, 15);
        final snoozed = snoozeReminderOneDay(
          reminder.copyWith(enabled: false),
          now,
        );
        expect(snoozed.enabled, isFalse);
        final until = DateTime.parse(snoozed.snoozedUntil!).toLocal();
        expect([until.day, until.hour, until.minute], [8, 12, 15]);
        expect(reminder.snoozedUntil, isNull);
      },
    );

    test('keeps calendar time across the spring DST boundary', () {
      final dates = nextReminderDates(
        reminder.copyWith(hour: 9, minute: 0, weekdays: [0, 1, 2, 3, 4, 5, 6]),
        DateTime(2026, 3, 7, 8),
        4,
      );
      expect(dates.map((date) => [date.day, date.hour]).toList(), [
        [7, 9],
        [8, 9],
        [9, 9],
        [10, 9],
      ]);
      // Dart offsets run east-positive; JS getTimezoneOffset runs west-positive,
      // so the sign of the change matches.
      final offsetChange = dates[1].timeZoneOffset - dates[0].timeZoneOffset;
      expect(
        dates[1].millisecondsSinceEpoch - dates[0].millisecondsSinceEpoch,
        86400000 - offsetChange.inMinutes * 60000,
      );
    });

    test('terminates safely at the last representable date', () {
      expect(
        nextReminderDates(
          reminder.copyWith(
            snoozedUntil: toIso(
              DateTime.fromMillisecondsSinceEpoch(
                8640000000000000,
                isUtc: true,
              ),
            ),
          ),
          DateTime(2026, 6, 15),
          3,
        ),
        isEmpty,
      );
    });

    test('keeps local time across the autumn DST boundary', () {
      final dates = nextReminderDates(
        reminder.copyWith(hour: 9, minute: 0, weekdays: [0, 1, 2, 3, 4, 5, 6]),
        DateTime(2026, 10, 31, 8),
        3,
      );
      expect(
        dates.map((date) => [date.month - 1, date.day, date.hour]).toList(),
        [
          [9, 31, 9],
          [10, 1, 9],
          [10, 2, 9],
        ],
      );
      final offsetChange = dates[1].timeZoneOffset - dates[0].timeZoneOffset;
      expect(
        dates[1].millisecondsSinceEpoch - dates[0].millisecondsSinceEpoch,
        86400000 - offsetChange.inMinutes * 60000,
      );
    });
  });
}
