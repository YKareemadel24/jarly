/// Integration regression for storage-failure feedback in the production root.
library;

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jarly/app.dart';
import 'package:jarly/data/key_value_storage.dart';
import 'package:jarly/data/savings_storage.dart';
import 'package:jarly/data/settings_repository.dart';
import 'package:jarly/domain/domain.dart';
import 'package:jarly/state/providers.dart';
import 'package:jarly/state/savings_controller.dart';
import 'package:jarly/state/settings_controller.dart';
import 'package:jarly/ui/router.dart';

import 'helpers.dart';

class _Settings extends SettingsController {
  @override
  Future<SettingsState> build() async =>
      SettingsState.initial.copyWith(ready: true);
}

class _StoredLockSettings extends SettingsController {
  @override
  Future<SettingsState> build() async {
    final storage = await ref.watch(storageProvider.future);
    final locked = await storage.getItem(pinLockKey) == 'true';
    return SettingsState.initial.copyWith(
      ready: true,
      pinLockEnabled: locked,
      hasPin: locked,
      pinLength: 4,
    );
  }
}

class _FailingStorage extends MemoryStorage {
  _FailingStorage(super.initial);

  @override
  Future<void> setItem(String key, String value) async {
    if (key == jarsKey) throw StateError('Injected storage failure');
    await super.setItem(key, value);
  }
}

void main() {
  testWidgets(
    'startup storage failure keeps routes closed and retries the original store',
    (tester) async {
      final initial = Completer<KeyValueStorage>();
      final storage = MemoryStorage({
        jarsKey: serializeJars([jar(balance: 1234)]),
        pinLockKey: 'true',
      });
      var opens = 0;
      final container = ProviderContainer(
        retry: (count, error) => null,
        overrides: [
          storageProvider.overrideWith(
            (ref) async => opens++ == 0 ? initial.future : storage,
          ),
          settingsProvider.overrideWith(_StoredLockSettings.new),
        ],
      );
      addTearDown(container.dispose);
      final router = container.read(routerProvider);
      addTearDown(router.dispose);
      router.go('/jar/trip');
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const JarlyApp(),
        ),
      );
      expect(find.text('Try again'), findsNothing);
      expect(find.text('This jar is no longer available.'), findsNothing);
      initial.completeError(StateError('Storage could not open'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 250));
      expect(find.text('Try again'), findsOneWidget);
      expect(find.text('This jar is no longer available.'), findsNothing);
      expect(find.text('Japan trip'), findsNothing);
      expect(container.read(savingsProvider).value?.writable, isNot(true));
      await expectLater(
        container
            .read(savingsProvider.notifier)
            .addEntry('trip', 100, directionDeposit),
        throwsA(isA<StoreException>()),
      );

      await tester.tap(find.text('Try again'));
      await tester.pump();
      final settings = await container.read(settingsProvider.future);
      await tester.pumpAndSettle();
      expect(opens, 2);
      expect(container.read(savingsProvider).value!.jars.single.balance, 1234);
      expect(settings.pinLockEnabled, isTrue);
      expect(find.text('Your Saving Jar is locked'), findsOneWidget);
      expect(router.routeInformationProvider.value.uri.path, '/jar/trip');
    },
  );

  testWidgets(
    'failed writes render the production-root warning and preserve savings',
    (tester) async {
      final storage = _FailingStorage({
        jarsKey: serializeJars([jar(balance: 100)]),
      });
      final container = ProviderContainer(
        overrides: [
          storageProvider.overrideWith((ref) async => storage),
          settingsProvider.overrideWith(_Settings.new),
        ],
      );
      addTearDown(container.dispose);
      final router = container.read(routerProvider);
      addTearDown(router.dispose);
      await container.read(savingsProvider.future);
      await container.read(settingsProvider.future);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const JarlyApp(),
        ),
      );
      await tester.pumpAndSettle();
      await expectLater(
        container
            .read(savingsProvider.notifier)
            .addEntry('trip', 25, directionDeposit),
        throwsA(isA<StoreException>()),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(
        find.text('Your latest changes could not be saved. Please try again.'),
        findsOneWidget,
      );
      expect(container.read(savingsProvider).value!.jars.single.balance, 100);
      expect((await loadPersistedJars(storage)).jars.single.balance, 100);
    },
  );
}
