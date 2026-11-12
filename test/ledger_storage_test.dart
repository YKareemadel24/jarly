/// Exercises ledger migration, interrupted native writes, and durable retries.
library;

import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:jarly/data/key_value_storage.dart';
import 'package:jarly/data/savings_storage.dart';
import 'package:jarly/services/ledger_storage_native.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory directory;

  Future<KeyValueStorage> open(MemoryStorage preferences) async {
    return FileLedgerStorage(
      File('${directory.path}/saving-jar-ledger.json'),
      preferences,
    ).initialize();
  }

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('jarly-ledger-test-');
    SharedPreferences.setMockInitialValues({jarsKey: 'committed'});
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('plugins.flutter.io/path_provider'),
          (_) async => directory.path,
        );
  });

  tearDown(() async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('plugins.flutter.io/path_provider'),
          null,
        );
    await directory.delete(recursive: true);
  });

  test(
    'reopening keeps the committed ledger without preference copies',
    () async {
      final storage = await createStorage();
      await storage.setItem(jarsKey, 'updated');

      SharedPreferences.setMockInitialValues({});
      final reopened = await createStorage();
      expect(await reopened.getItem(jarsKey), 'updated');
    },
  );

  test(
    'migration preserves current, backup, and original preference data',
    () async {
      final preferences = MemoryStorage({
        jarsKey: 'current',
        jarsBackupKey: 'backup',
        'saving-jar:theme': 'dark',
      });
      final storage = await open(preferences);
      expect(await storage.getItem(jarsKey), 'current');
      expect(await storage.getItem(jarsBackupKey), 'backup');
      expect(preferences.values[jarsKey], 'current');
      expect(preferences.values[jarsBackupKey], 'backup');

      await storage.setItem('saving-jar:theme', 'light');
      expect(preferences.values['saving-jar:theme'], 'light');
      await storage.removeItem('saving-jar:theme');
      expect(preferences.values.containsKey('saving-jar:theme'), isFalse);

      await storage.setItem(jarsKey, 'new current');
      final reopened = await open(preferences);
      expect(await reopened.getItem(jarsKey), 'new current');
      expect(await reopened.getItem(jarsBackupKey), 'backup');
      expect(preferences.values[jarsKey], 'current');
    },
  );

  test(
    'completed migration never revives removed preference snapshots',
    () async {
      final preferences = MemoryStorage({
        jarsKey: 'old',
        jarsBackupKey: 'older',
      });
      final storage = await open(preferences);
      await storage.removeItem(jarsKey);
      await storage.removeItem(jarsBackupKey);

      final reopened = await open(preferences);
      expect(await reopened.getItem(jarsKey), isNull);
      expect(await reopened.getItem(jarsBackupKey), isNull);
    },
  );

  test(
    'interrupted pending write never replaces the committed snapshot',
    () async {
      final preferences = MemoryStorage({jarsKey: 'committed'});
      final storage = await open(preferences);
      await storage.setItem(jarsBackupKey, 'backup');
      final file = File('${directory.path}/saving-jar-ledger.json');
      final pending = File('${file.path}.pending');
      await pending.writeAsString(
        (await file.readAsString()).replaceAll('committed', 'uncommitted'),
        flush: true,
      );

      final reopened = await open(preferences);
      expect(await reopened.getItem(jarsKey), 'committed');
      expect(await reopened.getItem(jarsBackupKey), 'backup');
      await reopened.setItem(jarsKey, 'retry');
      expect(await (await open(preferences)).getItem(jarsKey), 'retry');
    },
  );

  test(
    'failed write preserves the committed value and permits retry',
    () async {
      final preferences = MemoryStorage({jarsKey: 'committed'});
      final storage = await open(preferences);
      final blocked = Directory(
        '${directory.path}/saving-jar-ledger.json.pending',
      );
      await blocked.create();

      await expectLater(
        storage.setItem(jarsKey, 'failed'),
        throwsA(isA<FileSystemException>()),
      );
      expect(await storage.getItem(jarsKey), 'committed');
      expect(await (await open(preferences)).getItem(jarsKey), 'committed');
      await blocked.delete();

      await storage.setItem(jarsKey, 'retry');
      expect(await (await open(preferences)).getItem(jarsKey), 'retry');
    },
  );

  test(
    'failed migration leaves preference originals available for retry',
    () async {
      final preferences = MemoryStorage({
        jarsKey: 'current',
        jarsBackupKey: 'backup',
      });
      final blocked = Directory(
        '${directory.path}/saving-jar-ledger.json.pending',
      );
      await blocked.create();
      await expectLater(open(preferences), throwsA(isA<FileSystemException>()));
      expect(preferences.values, {jarsKey: 'current', jarsBackupKey: 'backup'});
      expect(
        await File('${directory.path}/saving-jar-ledger.json').exists(),
        isFalse,
      );

      await blocked.delete();
      final storage = await open(preferences);
      expect(await storage.getItem(jarsKey), 'current');
      expect(await storage.getItem(jarsBackupKey), 'backup');
    },
  );

  test('queued writes retain both the latest snapshot and backup', () async {
    final storage = await open(MemoryStorage());
    await Future.wait([
      storage.setItem(jarsKey, 'one'),
      storage.setItem(jarsBackupKey, 'one'),
      storage.setItem(jarsKey, 'two'),
    ]);

    final reopened = await open(MemoryStorage());
    expect(await reopened.getItem(jarsKey), 'two');
    expect(await reopened.getItem(jarsBackupKey), 'one');
  });

  for (final corrupt in [
    '{truncated',
    '[]',
    '{}',
    '{"version":1,"values":{"saving-jar:v3":123}}',
  ]) {
    test(
      'invalid ledger envelope refuses preference fallback: $corrupt',
      () async {
        final file = File('${directory.path}/saving-jar-ledger.json');
        await file.writeAsString(corrupt);
        await expectLater(
          open(MemoryStorage({jarsKey: 'stale'})),
          throwsFormatException,
        );
        expect(await file.readAsString(), corrupt);
      },
    );
  }
}
