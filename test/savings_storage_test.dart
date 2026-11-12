import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:jarly/data/key_value_storage.dart';
import 'package:jarly/data/savings_storage.dart';
import 'package:jarly/domain/domain.dart';

import 'helpers.dart';

void main() {
  final testJar = jar(
    id: 'one',
    name: 'One',
    target: 100,
    createdAt: '2026-01-01T00:00:00.000Z',
  );

  group('savings storage', () {
    test('loads the ledger and pauses malformed recurring rules', () async {
      final storage = MemoryStorage({
        jarsKey: serializeJars([
          jar(
            id: 'bad-cadence',
            balance: 100,
            recurring: const RecurringRule(
              amount: 25,
              cadence: 'hourly',
              paused: false,
            ),
          ),
          jar(
            id: 'bad-date',
            balance: 200,
            recurring: const RecurringRule(
              amount: 25,
              cadence: 'daily',
              paused: false,
              nextDate: 'invalid',
            ),
          ),
        ]),
      });
      final loaded = await loadPersistedJars(storage);
      expect(loaded.writable, isTrue);
      expect(loaded.jars.map((jar) => jar.balance), [100, 200]);
      expect(loaded.jars.every((jar) => jar.recurring!.paused), isTrue);
    });

    test(
      'honors an intentionally empty current store over older data',
      () async {
        final storage = MemoryStorage({
          jarsKey: '[]',
          jarsBackupKey: serializeJars([testJar]),
          'saving-jar:v2': serializeJars([testJar]),
        });
        final loaded = await loadPersistedJars(storage);
        expect(loaded.jars, isEmpty);
        expect(loaded.writable, isTrue);
      },
    );

    test(
      'recovers from the valid backup before a stale legacy store',
      () async {
        final storage = MemoryStorage({
          jarsKey: 'not-json',
          jarsBackupKey: serializeJars([testJar.copyWith(balance: 500)]),
          'saving-jar:v2': serializeJars([testJar.copyWith(balance: 100)]),
        });
        final recovered = await loadPersistedJars(storage);
        expect(recovered.jars[0].balance, 500);
      },
    );

    test(
      'serializes overlapping writes and retains the latest snapshot',
      () async {
        final base = MemoryStorage({jarsKey: '[]'});
        final values = base.values;
        final firstWriteBlocked = Completer<void>();
        final firstWriteStarted = Completer<void>();
        final storage = _BlockingStorage(base, (key, value) {
          if (key == jarsKey &&
              (jsonDecode(value) as List)[0]['balance'] == 100) {
            firstWriteStarted.complete();
            return firstWriteBlocked.future;
          }
          return null;
        });
        final older = JarsPersister().persist(storage, [
          testJar.copyWith(balance: 100),
        ]);
        await firstWriteStarted.future;
        final newer = JarsPersister().persist(storage, [
          testJar.copyWith(balance: 200),
        ]);
        firstWriteBlocked.complete();
        await Future.wait([older, newer]);
        expect(
          (jsonDecode(values[jarsKey] ?? '[]') as List)[0]['balance'],
          200,
        );
      },
    );

    test('does not copy corrupt current data over a valid backup', () async {
      final good = serializeJars([testJar.copyWith(balance: 500)]);
      final storage = MemoryStorage({jarsKey: 'broken', jarsBackupKey: good});
      await JarsPersister().persist(storage, [testJar.copyWith(balance: 700)]);
      expect(storage.values[jarsBackupKey], good);
    });

    test('rejects unsafe persisted money and uses a valid backup', () async {
      final storage = MemoryStorage({
        jarsKey: serializeJars([testJar.copyWith(balance: 9007199254740993)]),
        jarsBackupKey: serializeJars([testJar.copyWith(balance: 500)]),
      });
      final recovered = await loadPersistedJars(storage);
      expect(recovered.jars[0].balance, 500);
    });

    test('falls back to legacy stores with minor-unit scaling', () async {
      final storage = MemoryStorage({
        'saving-jar:v2':
            '[{"id":"legacy","name":"Legacy","target":100,'
            '"balance":50.5,"accent":"blue","icon":"x",'
            '"entries":[{"id":"e1","amount":50.5,"direction":"deposit",'
            '"at":"2026-01-02T00:00:00.000Z"}]}]',
      });
      final recovered = await loadPersistedJars(storage);
      expect(recovered.writable, isTrue);
      expect(recovered.jars[0].balance, 5050);
      expect(recovered.jars[0].accent, 'ocean');
    });

    test(
      'keeps corrupt data in a read-only mode instead of replacing it',
      () async {
        final storage = MemoryStorage({jarsKey: 'not-json'});
        final loaded = await loadPersistedJars(storage);
        expect(loaded.writable, isFalse);
        expect(loaded.jars, isEmpty);
      },
    );
  });
}

class _BlockingStorage implements KeyValueStorage {
  _BlockingStorage(this._base, this._gate);

  final KeyValueStorage _base;
  final Future<void>? Function(String key, String value) _gate;

  @override
  Future<String?> getItem(String key) => _base.getItem(key);

  @override
  Future<void> removeItem(String key) => _base.removeItem(key);

  @override
  Future<void> setItem(String key, String value) async {
    final gate = _gate(key, value);
    if (gate != null) await gate;
    await _base.setItem(key, value);
  }
}
