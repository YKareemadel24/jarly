/// Regression coverage for route privacy and focus across application locking.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:jarly/app.dart';
import 'package:jarly/data/key_value_storage.dart';
import 'package:jarly/data/savings_storage.dart';
import 'package:jarly/state/providers.dart';
import 'package:jarly/state/settings_controller.dart';
import 'package:jarly/ui/router.dart';

import 'helpers.dart';

class _LockedSettings extends SettingsController {
  @override
  Future<SettingsState> build() async => SettingsState.initial.copyWith(
    ready: true,
    pinLockEnabled: true,
    hasPin: true,
    pinLength: 4,
  );

  @override
  Future<String> tryUnlock(String pin) async => pin == '1234' ? 'ok' : 'wrong';
}

Future<void> _mount(WidgetTester tester, {GoRouter? router}) async {
  final storage = MemoryStorage({
    jarsKey: serializeJars([jar(name: 'Private trip', balance: 1234)]),
  });
  final container = ProviderContainer(
    overrides: [
      storageProvider.overrideWith((ref) async => storage),
      settingsProvider.overrideWith(_LockedSettings.new),
      if (router != null) routerProvider.overrideWithValue(router),
    ],
  );
  addTearDown(container.dispose);
  addTearDown(container.read(routerProvider).dispose);
  await container.read(savingsProvider.future);
  await container.read(settingsProvider.future);
  await tester.pumpWidget(
    UncontrolledProviderScope(container: container, child: const JarlyApp()),
  );
  await tester.pumpAndSettle();
}

Future<void> _unlock(WidgetTester tester) async {
  for (final digit in ['1', '2', '3', '4']) {
    await tester.tap(find.text(digit).hitTestable());
    await tester.pump();
  }
  await tester.pumpAndSettle();
}

Future<void> _resume(WidgetTester tester) async {
  for (final state in [
    AppLifecycleState.inactive,
    AppLifecycleState.hidden,
    AppLifecycleState.paused,
    AppLifecycleState.hidden,
    AppLifecycleState.inactive,
    AppLifecycleState.resumed,
  ]) {
    tester.binding.handleAppLifecycleStateChanged(state);
  }
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'locked launch and resume hide savings and actions from semantics',
    (tester) async {
      final semantics = tester.ensureSemantics();
      try {
        await _mount(tester);
        final private = RegExp(r'Private trip|\$12\.34');
        Iterable<String> exposedLabels() => tester.semantics
            .simulatedAccessibilityTraversal()
            .map((node) => node.getSemanticsData().label)
            .where(private.hasMatch);
        expect(find.text('Your Saving Jar is locked'), findsOneWidget);
        expect(exposedLabels(), isEmpty);
        await _unlock(tester);
        expect(exposedLabels(), isNotEmpty);
        await _resume(tester);
        expect(find.text('Your Saving Jar is locked'), findsOneWidget);
        expect(exposedLabels(), isEmpty);
      } finally {
        semantics.dispose();
      }
    },
  );

  testWidgets(
    'route controls cannot focus while locked and regain focus after unlock',
    (tester) async {
      final node = FocusNode();
      addTearDown(node.dispose);
      var activations = 0;
      final router = GoRouter(
        routes: [
          GoRoute(
            path: '/',
            builder: (context, state) => Scaffold(
              body: Align(
                alignment: Alignment.topLeft,
                child: TextButton(
                  focusNode: node,
                  onPressed: () => activations++,
                  child: const Text('Private action'),
                ),
              ),
            ),
          ),
        ],
      );
      await _mount(tester, router: router);
      node.requestFocus();
      await tester.pump();
      expect(node.hasFocus, isFalse);
      await tester.tapAt(tester.getCenter(find.text('Private action')));
      expect(activations, 0);

      await _unlock(tester);
      node.requestFocus();
      await tester.pump();
      expect(node.hasFocus, isTrue);
      await _resume(tester);
      expect(node.hasFocus, isFalse);
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      expect(activations, 0);
      await _unlock(tester);
      expect(node.hasFocus, isTrue);
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      expect(activations, 1);
    },
  );
}
