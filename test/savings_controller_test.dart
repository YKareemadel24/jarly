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
