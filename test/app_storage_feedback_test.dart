/// Integration regression for storage-failure feedback in the production root.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jarly/app.dart';
import 'package:jarly/data/key_value_storage.dart';
import 'package:jarly/data/savings_storage.dart';
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
