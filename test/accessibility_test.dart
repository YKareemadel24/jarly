/// Keyboard, semantics, contrast, and large-text regressions for core flows.
library;

import 'dart:ui' show SemanticsAction;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jarly/app.dart';
import 'package:jarly/core/theme/palette.dart';
import 'package:jarly/data/key_value_storage.dart';
import 'package:jarly/data/savings_storage.dart';
import 'package:jarly/domain/domain.dart';
import 'package:jarly/state/providers.dart';
import 'package:jarly/state/settings_controller.dart';
import 'package:jarly/ui/router.dart';
import 'package:jarly/ui/widgets/pressable.dart';
import 'package:jarly/ui/widgets/sheet_scaffold.dart';

import 'helpers.dart';

class _Settings extends SettingsController {
  @override
  Future<SettingsState> build() async =>
      SettingsState.initial.copyWith(ready: true);
}

Future<MemoryStorage> _mount(
  WidgetTester tester,
  String route, {
  Size size = const Size(900, 1000),
  double scale = 1,
  Brightness brightness = Brightness.light,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  tester.platformDispatcher.platformBrightnessTestValue = brightness;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
  final storage = MemoryStorage({
    jarsKey: serializeJars([
      jar(
        name: 'Trip',
        accent: 'amber',
        balance: 2000,
        entries: [dep(2000, toIso(DateTime.now()))],
      ),
    ]),
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
  router.go(route);
  await container.read(savingsProvider.future);
  await container.read(settingsProvider.future);
  await tester.pumpWidget(
    MediaQuery(
      data: MediaQueryData.fromView(tester.view)
          .copyWith(textScaler: TextScaler.linear(scale)),
      child: UncontrolledProviderScope(
        container: container,
        child: const JarlyApp(),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return storage;
}

bool _containsFocus(Finder target) {
  final primary = FocusManager.instance.primaryFocus;
  if (primary is FocusScopeNode) return false;
  final focus = primary?.context;
  if (focus == null) return false;
  for (final element in target.evaluate()) {
    var found = identical(element, focus);
    element.visitAncestorElements((parent) {
      if (identical(parent, focus)) found = true;
      return !found;
    });
    if (found) return true;
    focus.visitAncestorElements((parent) {
      if (identical(parent, element)) found = true;
      return !found;
    });
    if (found) return true;
  }
  return false;
}

Future<void> _tabTo(WidgetTester tester, Finder target) async {
  expect(target, findsOneWidget);
  for (var i = 0; i < 30; i++) {
    if (_containsFocus(target)) return;
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
  }
  fail('Keyboard traversal did not reach $target');
}

Future<void> _activate(
  WidgetTester tester,
  Finder target,
  LogicalKeyboardKey key,
) async {
  await _tabTo(tester, target);
  await tester.sendKeyEvent(key);
  await tester.pumpAndSettle();
}

double _contrast(Color a, Color b) {
  final first = a.computeLuminance();
  final second = b.computeLuminance();
  return first > second
      ? (first + .05) / (second + .05)
      : (second + .05) / (first + .05);
}

void main() {
  testWidgets('shared button supports Enter, Space, and a semantic tap', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    try {
      var activations = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Pressable(
              onTap: () => activations++,
              semantics: 'Test action',
              child: const Text('Activate'),
            ),
          ),
        ),
      );
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.pump();
      expect(
        find.descendant(
          of: find.byType(Pressable),
          matching: find.byWidgetPredicate(
            (widget) =>
                widget is DecoratedBox &&
                widget.decoration is BoxDecoration &&
                (widget.decoration as BoxDecoration).border != null,
          ),
        ),
        findsOneWidget,
      );
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.sendKeyEvent(LogicalKeyboardKey.space);
      expect(activations, 2);
      final node = tester.semantics
          .simulatedAccessibilityTraversal()
          .singleWhere(
            (node) => node.getSemanticsData().label.contains('Test action'),
          );
      node.owner!.performAction(node.id, SemanticsAction.tap);
      expect(activations, 3);
      await tester.tap(find.text('Activate'));
      expect(activations, 4);
    } finally {
      semantics.dispose();
    }
  });

  testWidgets('keyboard traversal skips a hidden sheet action', (tester) async {
    var pageActions = 0;
    var sheetActions = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Stack(
            children: [
              TextButton(
                autofocus: true,
                onPressed: () => pageActions++,
                child: const Text('Page action'),
              ),
              SheetScaffold(
                visible: false,
                onDismiss: () {},
                palette: Palette.light,
                child: Pressable(
                  onTap: () => sheetActions++,
                  child: const Text('Hidden action'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    expect(pageActions, 1);
    expect(sheetActions, 0);
  });

  testWidgets('the wizard can create a jar using keyboard navigation', (
    tester,
  ) async {
    final storage = await _mount(tester, '/jar/new');
    await _tabTo(tester, find.byType(TextField).first);
    tester.testTextInput.enterText('Keyboard jar');
    await tester.pump();
    await _activate(tester, find.text('Continue'), LogicalKeyboardKey.enter);
    expect(find.text('CHOOSE AN ICON'), findsOneWidget);
    await _activate(tester, find.text('Continue'), LogicalKeyboardKey.space);
    await _tabTo(tester, find.byType(TextField).first);
    tester.testTextInput.enterText('100');
    await tester.pump();
    expect(find.text('100'), findsOneWidget);
    await _activate(
      tester,
      find.text('Create my jar'),
      LogicalKeyboardKey.enter,
    );
    final saved = (await loadPersistedJars(storage)).jars;
    expect(saved.map((jar) => jar.name), contains('Keyboard jar'));
    expect(
      saved.singleWhere((jar) => jar.name == 'Keyboard jar').target,
      10000,
    );
  });

  testWidgets(
    'deposit and withdrawal can be entered and confirmed with the keyboard',
    (tester) async {
      final storage = await _mount(tester, '/jar/trip');
      final sheet = find.byWidgetPredicate(
        (widget) => widget is SheetScaffold && widget.visible,
      );
      for (final (opener, confirm, amount) in [
        ('Deposit', 'Add to jar', '2'),
        ('Withdraw', 'Confirm withdrawal', '1'),
      ]) {
        await _activate(tester, find.text(opener), LogicalKeyboardKey.enter);
        final field = find
            .descendant(of: sheet, matching: find.byType(TextField))
            .first;
        await _tabTo(tester, field);
        tester.testTextInput.enterText(amount);
        await tester.pump();
        await _activate(
          tester,
          find.descendant(of: sheet, matching: find.text(confirm)),
          LogicalKeyboardKey.enter,
        );
        expect(sheet, findsNothing);
        expect(_containsFocus(find.text(opener)), isTrue);
      }
      final saved = (await loadPersistedJars(storage)).jars.single;
      expect(saved.balance, 2100);
      expect(saved.entries.map((entry) => entry.direction), [
        directionWithdrawal,
        directionDeposit,
        directionDeposit,
      ]);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(seconds: 9));
    },
  );

  for (final brightness in Brightness.values) {
    for (final (route, label) in [
      ('/activity', 'Activity'),
      ('/stats', 'MONTHLY CONTRIBUTIONS'),
      ('/jar/trip', 'Withdraw'),
    ]) {
      testWidgets('$route reflows at 200% text in ${brightness.name} mode', (
        tester,
      ) async {
        await _mount(
          tester,
          route,
          size: const Size(320, 568),
          scale: 2,
          brightness: brightness,
        );
        expect(tester.takeException(), isNull);
        final text = find.text(label).first;
        expect(text, findsOneWidget);
        expect(MediaQuery.textScalerOf(tester.element(text)).scale(14), 28);
        if (route == '/jar/trip') {
          await tester.ensureVisible(find.text('Deposit'));
          await tester.pumpAndSettle();
          await tester.tap(find.text('Deposit'));
          await tester.pumpAndSettle();
          final sheet = find.byWidgetPredicate(
            (widget) => widget is SheetScaffold && widget.visible,
          );
          await tester.enterText(
            find.descendant(of: sheet, matching: find.byType(TextField)).first,
            '2',
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          expect(
            find.descendant(of: sheet, matching: find.text(r'$22.00')),
            findsOneWidget,
          );
        }
      });
    }
    for (final size in [const Size(568, 320), const Size(1024, 768)]) {
      testWidgets(
        'populated Insights reflows at $size with 200% ${brightness.name} text',
        (tester) async {
          await _mount(
            tester,
            '/stats',
            size: size,
            scale: 2,
            brightness: brightness,
          );
          expect(find.text('MONTHLY CONTRIBUTIONS'), findsOneWidget);
          expect(tester.takeException(), isNull);
        },
      );
    }
    testWidgets(
      'detail progress and Deposit text meet contrast in ${brightness.name} mode',
      (tester) async {
        await _mount(tester, '/jar/trip', brightness: brightness);
        final palette = Palette.of(brightness);
        final progress = tester.widget<Text>(find.text('20% complete'));
        final deposit = tester.widget<Text>(find.text('Deposit'));
        expect(
          _contrast(progress.style!.color!, palette.surface),
          greaterThanOrEqualTo(4.5),
        );
        expect(
          _contrast(deposit.style!.color!, palette.primary),
          greaterThanOrEqualTo(4.5),
        );
      },
    );
  }
}
