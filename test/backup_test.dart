import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:jarly/data/key_value_storage.dart';
import 'package:jarly/data/savings_storage.dart';
import 'package:jarly/domain/domain.dart';
import 'package:jarly/transfer/backup.dart';
import 'package:jarly/transfer/transfer.dart';

import 'helpers.dart';

Matcher throwsWith(String fragment) => throwsA(
  predicate(
    (e) => e.toString().contains(fragment),
    'message contains "$fragment"',
  ),
);

final Jar backupJar = jar(
  id: 'trip',
  name: 'Trip',
  target: 500,
  balance: 500,
  milestonesHit: [100],
  archived: true,
  entries: [
    const Entry(
      id: 'deposit',
      amount: 500,
      direction: directionDeposit,
      at: '2026-01-02T00:00:00.000Z',
      note: 'Saved',
    ),
  ],
);

List<String> frames(List<Jar> jars, [String currency = 'USD']) =>
    encodeTransferFrames(
      TransferSnapshot(
        version: 1,
        exportedAt: '2026-01-03T00:00:00.000Z',
        currency: currency,
        jars: jars,
      ),
    );

void main() {
  test(
    'supported deadlines round-trip through local storage, QR, and backup',
    () async {
      const deadlines = [
        '2026-12-31',
        '2026-12-31T12:00:00.000Z',
        'December 2026',
      ];
      final jars = [
        for (var i = 0; i < deadlines.length; i++)
          backupJar.copyWith(id: 'deadline-$i', deadline: deadlines[i]),
      ];
      final storage = MemoryStorage({jarsKey: serializeJars(jars)});
      final loaded = (await loadPersistedJars(storage)).jars;
      expect(loaded.map((jar) => jar.deadline), deadlines);
      final codes = frames(loaded);
      expect(
        decodeTransferFrames(codes)!.snapshot!.jars.map((jar) => jar.deadline),
        deadlines,
      );
      expect(
        parseBackup(createBackup(codes)).snapshot.jars
            .map((jar) => jar.deadline),
        deadlines,
      );
      final tooLong = backupJar.copyWith(deadline: 'December${' ' * 32}2026');
      expect(decodeTransferFrames(frames([tooLong]))!.snapshot, isNull);
      final invalidExportDate = encodeTransferFrames(
        TransferSnapshot(
          version: transferVersion,
          exportedAt: 'December 2026',
          currency: 'USD',
          jars: loaded,
        ),
      );
      expect(decodeTransferFrames(invalidExportDate)!.snapshot, isNull);
    },
  );

  group('file backups', () {
    test(
      'recognizes an unchanged local jar after optional flags round-trip',
      () {
        final local = backupJar.copyWith(
          archived: null,
          recurring: const RecurringRule(
            amount: 100,
            cadence: 'weekly',
            nextDate: '2026-02-01',
            paused: false,
          ),
        );
        final backup = parseBackup(createBackup(frames([local])));
        final result = previewBackup(backup, [local], 'USD');
        expect(result.skipped, 1);
        expect(result.error, isNull);
      },
    );

    test('round-trips an empty backup with its currency and date', () {
      final backup = parseBackup(createBackup(frames([])));
      expect(backup.snapshot.jars, isEmpty);
      expect(backup.snapshot.currency, 'USD');
      expect(backup.snapshot.exportedAt, '2026-01-03T00:00:00.000Z');
      expect(backup.summary.jars, 0);
      expect(backup.summary.entries, 0);
      expect(backup.summary.totalMinor, '0');
    });

    test('includes archived, completed and empty jars and preserves the original frames', () {
      final original = frames([
        backupJar,
        backupJar.copyWith(
          id: 'empty',
          balance: 0,
          archived: false,
          entries: [],
        ),
      ]);
      final backup = parseBackup(createBackup(original));
      expect(backup.frames, original);
      expect(backup.snapshot.jars[0].isArchived, isTrue);
      expect(backup.snapshot.jars[0].balance, 500);
      expect(backup.snapshot.jars[0].milestonesHit, [100]);
      expect(backup.summary.jars, 2);
      expect(backup.summary.entries, 1);
      expect(backup.summary.archived, 1);
      expect(backup.summary.totalMinor, '500');
    });

    test('rejects malformed or future content', () {
      const malformed = [
        'not JSON',
        'null',
        '{}',
        '{"format":"jarly-backup","version":2,"frames":[]}',
        '{"format":"jarly-backup","version":1,"frames":["no"]}',
      ];
      for (final text in malformed) {
        expect(
          () => parseBackup(text),
          throwsA(isA<BackupParseException>()),
          reason: 'should reject: $text',
        );
      }
    });

    test('rejects oversized content before parsing it', () {
      expect(
        () => parseBackup(' ' * (maxBackupBytes + 1)),
        throwsWith("large"),
      );
    });

    test(
      'rejects stray invalid frames instead of silently ignoring damage',
      () {
        final text = createBackup(frames([]));
        final damaged = text.replaceFirst(
          '"frames":[',
          '"frames":["damaged frame",',
        );
        expect(
          () => parseBackup(damaged),
          throwsA(isA<BackupParseException>()),
        );
      },
    );

    test('totals archived jars exactly when their combined balances exceed safe numbers', () {
      final large = backupJar.copyWith(balance: maxSafeInteger, entries: []);
      final backup = parseBackup(
        createBackup(frames([large, large.copyWith(id: 'other')])),
      );
      expect(backup.summary.totalMinor, '18014398509481982');
    });

    test('rejects missing frames, missing currency, and altered balances', () {
      expect(
        () => createBackup(frames([backupJar]).sublist(1)),
        throwsA(isA<BackupParseException>()),
      );
      expect(
        () => createBackup(
          encodeTransferFrames(
            const TransferSnapshot(
              version: 1,
              exportedAt: '2026-01-03T00:00:00.000Z',
              jars: [],
            ),
          ),
        ),
        throwsWith("currency"),
      );
      expect(
        () => parseBackup(
          '{"format":"jarly-backup","version":1,"frames":'
          '${jsonEncode(frames([backupJar.copyWith(balance: 400)]))}}',
        ),
        throwsWith("balance"),
      );
    });

    test('previews an atomic merge and safely skips repeated restores', () {
      final backup = parseBackup(createBackup(frames([backupJar])));
      final local = backupJar.copyWith(id: 'local', entries: []);
      final first = previewBackup(backup, [local], 'USD');
      expect(first.added, 1);
      expect(first.updated, 0);
      expect(first.skipped, 0);
      expect(first.jars, hasLength(2));
      final second = previewBackup(backup, first.jars, 'USD');
      expect(second.added, 0);
      expect(second.updated, 0);
      expect(second.skipped, 1);
      expect(second.jars[1].isArchived, isTrue);
      expect(second.jars[1].balance, 500);
    });

    test(
      'refuses currency or history conflicts without changing local jars',
      () {
        final backup = parseBackup(createBackup(frames([backupJar])));
        expect(previewBackup(backup, [], 'EUR').error, contains('currency'));
        final local = [
          backupJar.copyWith(
            entries: [backupJar.entries[0].copyWith(note: 'Different')],
          ),
        ];
        final result = previewBackup(backup, local, 'USD');
        expect(result.error, isNotNull);
        expect(result.jars, same(local));
      },
    );
  });
}
