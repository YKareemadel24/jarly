import 'package:flutter_test/flutter_test.dart';
import 'package:jarly/data/key_value_storage.dart';
import 'package:jarly/data/settings_repository.dart';

void main() {
  group('PIN record format', () {
    test('creates and verifies hashed records', () {
      final record = makePinRecord('1234');
      expect(record.startsWith('v1:4:'), isTrue);
      expect(verifyPinRecord(record, '1234'), isTrue);
      expect(verifyPinRecord(record, '1235'), isFalse);
    });

    test('salts each record differently', () {
      final first = makePinRecord('1234');
      final second = makePinRecord('1234');
      expect(first, isNot(second));
      expect(verifyPinRecord(second, '1234'), isTrue);
    });

    test('verifies legacy plaintext records and reports their length', () {
      expect(verifyPinRecord('4321', '4321'), isTrue);
      expect(verifyPinRecord('4321', '9999'), isFalse);
      expect(pinLengthOf('4321'), 4);
      expect(pinLengthOf(null), isNull);
    });

    test('reports the digit count of hashed records', () {
      expect(pinLengthOf(makePinRecord('123456')), 6);
      expect(pinLengthOf('v1:bogus'), isNull);
    });
  });

  group('PIN lockout schedule', () {
    test('is free for the first handful of failures', () {
      for (var failures = 0; failures < pinFreeAttempts; failures++) {
        expect(lockoutMsFor(failures), 0);
      }
    });

    test('escalates and then holds at the longest delay', () {
      expect(lockoutMsFor(pinFreeAttempts), 30000);
      expect(lockoutMsFor(pinFreeAttempts + 1), 60000);
      expect(lockoutMsFor(pinFreeAttempts + 2), 5 * 60000);
      expect(lockoutMsFor(pinFreeAttempts + 3), 15 * 60000);
      expect(lockoutMsFor(pinFreeAttempts + 4), 15 * 60000);
      expect(lockoutMsFor(pinFreeAttempts + 100), 15 * 60000);
    });
  });

  group('attempt throttle persistence', () {
    test('round-trips and tolerates corrupt records', () async {
      final storage = MemoryStorage();
      expect(await readAttempts(storage).then((a) => a.failures), 0);

      await writeAttempts(
          storage, const PinAttemptState(failures: 3, lockedUntil: 12345));
      final state = await readAttempts(storage);
      expect(state.failures, 3);
      expect(state.lockedUntil, 12345);

      await storage.setItem(pinAttemptsKey, '{broken');
      final corrupt = await readAttempts(storage);
      expect(corrupt.failures, 0);
      expect(corrupt.lockedUntil, 0);
    });
  });
}
