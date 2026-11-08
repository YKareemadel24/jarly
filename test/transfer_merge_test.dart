import 'package:flutter_test/flutter_test.dart';
import 'package:jarly/domain/domain.dart';
import 'package:jarly/transfer/merge.dart';

import 'helpers.dart';

Entry entry(String id, int amount, {String at = '2026-01-02T00:00:00.000Z', String? direction}) =>
    Entry(
      id: id,
      amount: amount,
      direction: direction ?? directionDeposit,
      at: at,
    );

Jar jarOf(List<Entry> entries, int balance, {String id = 'jar-a'}) => jar(
      id: id,
      name: 'Trip',
      target: 10000,
      balance: balance,
      entries: entries,
    );

void main() {
  group('transfer merge', () {
    test('rejects a withdrawal made before funds were available', () {
      final incoming = jarOf(
        [
          entry('later', 100, at: '2026-01-03T00:00:00.000Z'),
          entry('earlier', 100, direction: directionWithdrawal),
        ],
        0,
      );
      expect(mergeTransferJars([], [incoming]).error, isNotNull);
    });

    test('preserves safe large balances without intermediate floating point rounding', () {
      const maximum = maxSafeInteger;
      final incoming = jarOf(
        [
          entry('later', maximum - 1, at: '2026-01-03T00:00:00.000Z'),
          entry('earlier', maximum, direction: directionWithdrawal),
        ],
        maximum - 1,
      ).copyWith(openingBalance: maximum);
      final result = mergeTransferJars([], [incoming]);
      expect(result.added, 1);
      expect(result.jars[0].id, incoming.id);
      expect(result.jars[0].balance, incoming.balance);
      expect(result.jars[0].openingBalance, maximum);
    });

    test('rejects a currency mismatch without changing local jars', () {
      final local = [jarOf([], 0)];
      final result = mergeTransferJars(local, [], 'EUR', 'USD');
      expect(result.error, isNotNull);
      expect(result.jars, same(local));
    });

    test('rejects divergent histories instead of replacing local entries', () {
      final local = [jarOf([entry('local', 20)], 20)];
      final incoming = [jarOf([entry('remote', 30)], 30)];
      final result = mergeTransferJars(local, incoming, 'USD', 'USD');
      expect(result.error, isNotNull);
      expect(result.jars, same(local));
    });

    test('updates only when incoming history contains the local history', () {
      final local = [jarOf([entry('old', 20)], 50)];
      final incoming = [
        jarOf([entry('new', 30), entry('remote-old', 20)], 50),
      ];
      final result = mergeTransferJars(local, incoming, 'USD', 'USD');
      expect(result.updated, 1);
      expect(result.jars[0].entries, hasLength(2));
    });

    test('rejects an aggregate balance outside safe integer precision', () {
      final result = mergeTransferJars(
        [],
        [
          jarOf([], maxSafeInteger, id: 'one'),
          jarOf([], 1, id: 'two'),
        ],
        'USD',
        'USD',
      );
      expect(result.error, isNotNull);
      expect(result.jars, isEmpty);
    });

    test('rejects an incoming balance that contradicts its entry history', () {
      final incoming = jarOf([entry('deposit', 20)], 30);
      final result = mergeTransferJars([], [incoming], 'USD', 'USD');
      expect(result.error, isNotNull);
      expect(result.jars, isEmpty);
    });
  });
}
