/// Regression coverage for acknowledged savings commits and failure recovery.
library;

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jarly/data/key_value_storage.dart';
import 'package:jarly/data/savings_storage.dart';
import 'package:jarly/domain/domain.dart';
import 'package:jarly/state/providers.dart';
import 'package:jarly/state/savings_controller.dart';

import 'helpers.dart';

class _ControlledStorage extends MemoryStorage {
  _ControlledStorage(super.initial);

  Completer<void>? gate;
  final started = Completer<void>();
  bool fail = false;
  bool failOnce = false;

  @override
  Future<void> setItem(String key, String value) async {
    if (key == jarsKey) {
      if (!started.isCompleted) started.complete();
      await gate?.future;
      if (fail || failOnce) {
        failOnce = false;
        throw StateError('Injected write failure');
      }
    }
    await super.setItem(key, value);
  }
}

ProviderContainer _container(KeyValueStorage storage) {
  final container = ProviderContainer(
    overrides: [storageProvider.overrideWith((ref) async => storage)],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  test(
    'startup persists recurring entries and cursor before publishing',
    () async {
      final due = DateTime.now().subtract(const Duration(hours: 1));
      final storage = MemoryStorage({
        jarsKey: serializeJars([
          jar(
            recurring: RecurringRule(
              amount: 25,
              cadence: 'daily',
              paused: false,
              nextDate: toIso(due),
            ),
          ),
        ]),
      });
      final first = (await _container(storage).read(savingsProvider.future))
          .jars
          .single;
      expect(first.balance, 25);
      final saved = (await loadPersistedJars(storage)).jars.single;
      expect(saved.balance, 25);
      expect(saved.entries.single.id, first.entries.single.id);
      expect(saved.recurring!.nextDate, toIso(addCadence(due, 'daily')));
      final reopened = (await _container(storage).read(savingsProvider.future))
          .jars
          .single;
      expect(reopened.entries.single.id, first.entries.single.id);
      expect(reopened.balance, 25);
    },
  );

  test(
    'failed startup catch-up keeps the last saved balance and cursor',
    () async {
      final due = toIso(DateTime.now().subtract(const Duration(hours: 1)));
      final storage = _ControlledStorage({
        jarsKey: serializeJars([
          jar(
            recurring: RecurringRule(
              amount: 25,
              cadence: 'daily',
              paused: false,
              nextDate: due,
            ),
          ),
        ]),
      })..fail = true;
      final state = await _container(storage).read(savingsProvider.future);
      expect(state.jars.single.entries, isEmpty);
      expect(state.jars.single.balance, 0);
      expect(state.jars.single.recurring!.nextDate, due);
      expect(state.storageError, isNotNull);
    },
  );

  test(
    'restoring an archived rule resumes from now without backfill',
    () async {
      final due = toIso(DateTime.now().subtract(const Duration(days: 3)));
      final storage = MemoryStorage({
        jarsKey: serializeJars([
          jar(
            archived: true,
            recurring: RecurringRule(
              amount: 25,
              cadence: 'daily',
              paused: false,
              nextDate: due,
            ),
          ),
        ]),
      });
      final container = _container(storage);
      final first = (await container.read(savingsProvider.future)).jars.single;
      expect(first.balance, 0);
      await container.read(savingsProvider.notifier).restoreJar('trip');
      final restored = (await loadPersistedJars(storage)).jars.single;
      expect(restored.isArchived, isFalse);
      expect(restored.entries, isEmpty);
      expect(
        DateTime.parse(restored.recurring!.nextDate!).isAfter(DateTime.now()),
        isTrue,
      );
      final reopened = (await _container(storage).read(savingsProvider.future))
          .jars
          .single;
      expect(reopened.entries, isEmpty);
      expect(reopened.recurring!.nextDate, restored.recurring!.nextDate);
    },
  );

  test('acknowledges a deposit only after storage commits', () async {
    final storage = _ControlledStorage({
      jarsKey: serializeJars([jar(balance: 100)]),
    })..gate = Completer<void>();
    final container = _container(storage);
    await container.read(savingsProvider.future);
    var acknowledged = false;
    final operation =
        Future.sync(
          () => container
              .read(savingsProvider.notifier)
              .addEntry('trip', 25, directionDeposit),
        ).then((value) {
          acknowledged = true;
          return value;
        });
    await storage.started.future;
    try {
      expect(acknowledged, isFalse);
      expect(container.read(savingsProvider).value!.jars.single.balance, 100);
      expect((await loadPersistedJars(storage)).jars.single.balance, 100);
    } finally {
      storage.gate!.complete();
      await operation;
    }
    expect(container.read(savingsProvider).value!.jars.single.balance, 125);
    expect((await loadPersistedJars(storage)).jars.single.balance, 125);
  });

  test(
    'failed writes retain the accepted state and allow one safe retry',
    () async {
      final storage = _ControlledStorage({
        jarsKey: serializeJars([jar(balance: 100)]),
      })..fail = true;
      final container = _container(storage);
      await container.read(savingsProvider.future);
      final controller = container.read(savingsProvider.notifier);
      await expectLater(
        Future.sync(() => controller.addEntry('trip', 25, directionDeposit)),
        throwsA(isA<StoreException>()),
      );
      expect(container.read(savingsProvider).value!.jars.single.balance, 100);
      expect(container.read(savingsProvider).value!.storageError, isNotNull);
      storage.fail = false;
      expect(
        await controller.addEntry('trip', 25, directionDeposit),
        isNotNull,
      );
      final loaded = await loadPersistedJars(storage);
      expect(loaded.jars.single.balance, 125);
      expect(loaded.jars.single.entries, hasLength(1));
      expect(container.read(savingsProvider).value!.storageError, isNull);
    },
  );

  test('rejects mutations while storage is read-only', () async {
    final storage = MemoryStorage({jarsKey: 'damaged'});
    final container = _container(storage);
    await container.read(savingsProvider.future);
    await expectLater(
      Future.sync(
        () => container
            .read(savingsProvider.notifier)
            .addJar(
              const JarInput(
                name: 'New',
                target: 100,
                accent: 'ocean',
                icon: 'flight',
                kind: kindGoal,
              ),
            ),
      ),
      throwsA(isA<StoreException>()),
    );
    expect(container.read(savingsProvider).value!.jars, isEmpty);
    expect(storage.values[jarsKey], 'damaged');
  });

  test('rejects mutations before hydration', () async {
    final ready = Completer<KeyValueStorage>();
    final container = ProviderContainer(
      overrides: [storageProvider.overrideWith((ref) => ready.future)],
    );
    addTearDown(container.dispose);
    final controller = container.read(savingsProvider.notifier);
    try {
      await expectLater(
        Future.sync(
          () => controller.addJar(
            const JarInput(
              name: 'New',
              target: 100,
              accent: 'ocean',
              icon: 'flight',
              kind: kindGoal,
            ),
          ),
        ),
        throwsA(isA<StoreException>()),
      );
    } finally {
      ready.complete(MemoryStorage());
      await container.read(savingsProvider.future);
    }
    expect(container.read(savingsProvider).value!.jars, isEmpty);
  });

  test('validates queued withdrawals against the last saved balance', () async {
    final storage = _ControlledStorage({
      jarsKey: serializeJars([jar(balance: 100)]),
    })..gate = Completer<void>();
    final container = _container(storage);
    await container.read(savingsProvider.future);
    final controller = container.read(savingsProvider.notifier);
    final first = Future.sync(
      () => controller.addEntry('trip', 75, directionWithdrawal),
    );
    await storage.started.future;
    final second = Future.sync(
      () => controller.addEntry('trip', 75, directionWithdrawal),
    );
    storage.gate!.complete();
    expect(await first, isNotNull);
    expect(await second, isNull);
    final loaded = await loadPersistedJars(storage);
    expect(loaded.jars.single.balance, 25);
    expect(loaded.jars.single.entries, hasLength(1));
  });

  test(
    'a queued intent does not use the balance of a failed earlier intent',
    () async {
      final storage =
          _ControlledStorage({
              jarsKey: serializeJars([jar(balance: 100)]),
            })
            ..gate = Completer<void>()
            ..failOnce = true;
      final container = _container(storage);
      await container.read(savingsProvider.future);
      final controller = container.read(savingsProvider.notifier);
      final first = controller.addEntry('trip', 25, directionDeposit);
      final failure = expectLater(first, throwsA(isA<StoreException>()));
      await storage.started.future;
      final second = controller.addEntry('trip', 110, directionWithdrawal);
      storage.gate!.complete();
      await failure;
      expect(await second, isNull);
      expect(
        await controller.addEntry('trip', 50, directionWithdrawal),
        isNotNull,
      );
      final loaded = await loadPersistedJars(storage);
      expect(loaded.jars.single.balance, 50);
      expect(loaded.jars.single.entries, hasLength(1));
      expect(loaded.jars.single.entries.single.direction, directionWithdrawal);
    },
  );
}
