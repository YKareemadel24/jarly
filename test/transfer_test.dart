import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:jarly/domain/domain.dart';
import 'package:jarly/transfer/merge.dart';
import 'package:jarly/transfer/transfer.dart';

import 'helpers.dart';

final Jar baseJar = jar(
  id: 'jar-a',
  name: 'Trip',
  target: 10000,
  balance: 500,
  entries: [
    const Entry(
      id: 'entry-a',
      amount: 500,
      direction: directionDeposit,
      at: '2026-01-02T00:00:00.000Z',
    ),
  ],
);

TransferSnapshot snapshotOf(List<Jar> jars) => TransferSnapshot(
  version: 1,
  exportedAt: '2026-01-03T00:00:00.000Z',
  currency: 'USD',
  jars: jars,
);

void main() {
  group('transfer codec', () {
    test('accepts the maximum safe target and recurring amount and rejects the next integer', () {
      final boundary = baseJar.copyWith(
        target: maxSafeInteger,
        recurring: const RecurringRule(
          amount: maxSafeInteger,
          cadence: 'daily',
          paused: true,
        ),
      );
      TransferAssembly decoded(Jar jar) =>
          decodeTransferFrames(encodeTransferFrames(snapshotOf([jar])))!;
      expect(decoded(boundary).snapshot!.jars.single.target, maxSafeInteger);
      expect(
        decoded(boundary).snapshot!.jars.single.recurring!.amount,
        maxSafeInteger,
      );
      for (final invalid in [
        boundary.copyWith(target: maxSafeInteger + 1),
        boundary.copyWith(
          recurring: boundary.recurring!.copyWith(amount: maxSafeInteger + 1),
        ),
      ]) {
        expect(decoded(invalid).snapshot, isNull);
        expect(decoded(invalid).error, isNotNull);
      }
    });

    test('round-trips valid jars and their creation timestamp', () {
      final decoded = decodeTransferFrames(
        encodeTransferFrames(snapshotOf([baseJar])),
      );
      final restored = decoded!.snapshot!.jars[0];
      expect(restored.id, baseJar.id);
      expect(restored.balance, 500);
      expect(restored.createdAt, baseJar.createdAt);
    });

    test('rejects unsafe or fractional money before creating jars', () {
      // The typed Jar cannot hold a fractional balance, so craft the wire JSON
      // a hostile or legacy sender could produce.
      final wire = {
        'v': 1,
        'at': '2026-01-03T00:00:00.000Z',
        'cur': 'USD',
        'jars': [
          {
            'i': 'jar-a',
            'n': 'Trip',
            't': 10000,
            'b': 1.5,
            'a': 'ocean',
            'c': 'flight',
            'ca': '2026-01-01T00:00:00.000Z',
            'k': 'goal',
            'e': <Object?>[
              [500, 1, '2026-01-02T00:00:00.000Z', null, null, 'entry-a'],
            ],
          },
        ],
      };
      final payload = bytesToBase64Url(utf8.encode(jsonEncode(wire)));
      final frames = ['JARLY1.craft1.1.1.$payload'];
      final decoded = decodeTransferFrames(frames);
      expect(decoded!.snapshot, isNull);
      expect(decoded.error, isNotNull);
    });

    test('rejects frames from different transfer sessions', () {
      final longJar = baseJar.copyWith(
        entries: [
          for (var index = 0; index < 20; index++)
            Entry(
              id: 'entry-$index',
              amount: 25,
              direction: directionDeposit,
              at: '2026-01-02T00:00:00.000Z',
              note: 'x' * 80,
            ),
        ],
        balance: 500,
      );
      final first = encodeTransferFrames(snapshotOf([longJar]));
      final second = encodeTransferFrames(
        snapshotOf([longJar.copyWith(name: 'Other')]),
      );
      expect(first.length, greaterThan(1));
      final decoded = decodeTransferFrames([first[0], ...second.sublist(1)]);
      expect(decoded!.snapshot, isNull);
      expect(decoded.error, isNotNull);
    });

    test('rejects an unbounded frame count without iterating it', () {
      expect(decodeTransferFrames(['JARLY1.abcdef.1.999999999999.x']), isNull);
    });

    test('rejects duplicate jar IDs in one snapshot', () {
      final decoded = decodeTransferFrames(
        encodeTransferFrames(
          snapshotOf([baseJar, baseJar.copyWith(name: 'Duplicate')]),
        ),
      );
      expect(decoded!.snapshot, isNull);
      expect(decoded.error, isNotNull);
    });

    test(
      'preserves correction history, undo links, and personal reminders',
      () {
        const auditedReminder = JarReminder(
          enabled: true,
          hour: 18,
          minute: 30,
          weekdays: [1, 4],
          snoozedUntil: '2026-02-01T12:00:00.000Z',
        );
        final audited = baseJar.copyWith(
          reminder: auditedReminder,
          balance: 0,
          entries: [
            baseJar.entries[0].copyWith(
              revisions: [
                const EntryRevision(
                  amount: 700,
                  at: '2026-01-01T12:00:00.000Z',
                  note: 'Original',
                  changedAt: '2026-01-02T12:00:00.000Z',
                ),
              ],
            ),
            const Entry(
              id: 'reversal',
              amount: 500,
              direction: directionWithdrawal,
              at: '2026-01-03T00:00:00.000Z',
              undoOf: 'entry-a',
            ),
          ],
        );
        final restored = decodeTransferFrames(
          encodeTransferFrames(snapshotOf([audited])),
        )!.snapshot!.jars[0];
        expect(restored.reminder, auditedReminder);
        expect(restored.entries[0].id, 'entry-a');
        expect(restored.entries[0].revisions, audited.entries[0].revisions);
        expect(restored.entries[1].id, 'reversal');
        expect(restored.entries[1].undoOf, 'entry-a');
      },
    );

    test('rejects invalid reminder settings and fabricated undo history', () {
      final invalidReminder = baseJar.copyWith(
        reminder: const JarReminder(
          enabled: true,
          hour: 25,
          minute: 0,
          weekdays: [1],
        ),
      );
      expect(
        decodeTransferFrames(
          encodeTransferFrames(snapshotOf([invalidReminder])),
        )!.snapshot,
        isNull,
      );
      final invalidUndo = baseJar.copyWith(
        entries: [baseJar.entries[0].copyWith(undoOf: 'missing')],
      );
      expect(
        decodeTransferFrames(encodeTransferFrames(snapshotOf([invalidUndo])))!
            .snapshot,
        isNull,
      );
    });

    test('restores a migrated opening balance after later contributions', () {
      final legacy = normaliseJar({
        'id': baseJar.id,
        'name': baseJar.name,
        'target': baseJar.target,
        'balance': 5000,
        'accent': baseJar.accent,
        'icon': baseJar.icon,
        'kind': baseJar.kind,
        'createdAt': baseJar.createdAt,
        'milestonesHit': baseJar.milestonesHit,
        'entries': <Map<String, dynamic>>[],
      });
      final updated = applyEntry(legacy, 2000, directionDeposit)!.jar;
      final restored = decodeTransferFrames(
        encodeTransferFrames(snapshotOf([updated])),
      )!.snapshot!.jars;
      final merged = mergeTransferJars([], restored);
      expect(merged.error, isNull);
      expect(merged.jars[0].balance, 7000);
    });

    test('frames produced here decode with legacy tuple shapes (null padding)', () {
      // An entry without note/source/revisions must emit explicit nulls so the
      // original app's decoder reads the same tuple.
      final frames = encodeTransferFrames(snapshotOf([baseJar]));
      final payload = frames.join('');
      expect(payload, startsWith('JARLY1.'));
      final decoded = decodeTransferFrames(frames);
      expect(decoded!.error, isNull);
      expect(decoded.snapshot!.jars[0].entries[0].source, sourceManual);
      expect(decoded.snapshot!.jars[0].entries[0].note, isNull);
    });
  });
}
