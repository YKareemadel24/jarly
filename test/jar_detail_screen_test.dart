/// Regression coverage for amount previews and transaction corrections.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jarly/data/key_value_storage.dart';
import 'package:jarly/data/savings_storage.dart';
import 'package:jarly/domain/domain.dart';
import 'package:jarly/state/providers.dart';
import 'package:jarly/state/settings_controller.dart';
import 'package:jarly/ui/screens/jar_detail_screen.dart';
import 'package:jarly/ui/widgets/pressable.dart';
import 'package:jarly/ui/widgets/sheet_scaffold.dart';

import 'helpers.dart';

class _Settings extends SettingsController {
  @override
  Future<SettingsState> build() async =>
      SettingsState.initial.copyWith(ready: true);
}

Future<void> _mount(WidgetTester tester, MemoryStorage storage) async {
  tester.view.physicalSize = const Size(1000, 1600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final container = ProviderContainer(
    overrides: [
      storageProvider.overrideWith((ref) async => storage),
      settingsProvider.overrideWith(_Settings.new),
    ],
  );
  addTearDown(container.dispose);
  await container.read(savingsProvider.future);
  expect(container.read(savingsProvider).value!.jars.single.id, 'trip');
  await container.read(settingsProvider.future);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(
        home: Scaffold(
          body: SizedBox.expand(child: JarDetailScreen(jarId: 'trip')),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Finder get _sheet => find.byWidgetPredicate(
  (widget) => widget is SheetScaffold && widget.visible,
);

void main() {
  testWidgets('deposit preview and reload preserve cents near the limit', (
    tester,
  ) async {
    final storage = MemoryStorage({
      jarsKey: serializeJars([jar(target: maxSafeInteger)]),
    });
    await _mount(tester, storage);
    final deposit = find.byWidgetPredicate(
      (widget) =>
          widget is Pressable && widget.semantics == 'Deposit into Japan trip',
      skipOffstage: false,
    );
    await tester.ensureVisible(deposit);
    await tester.tap(deposit);
    await tester.pumpAndSettle();
    await tester.enterText(
      find.descendant(of: _sheet, matching: find.byType(TextField)).first,
      '90071992547409.01',
    );
    await tester.pump();
    expect(
      find.descendant(
        of: _sheet,
        matching: find.text(r'$90,071,992,547,409.01'),
      ),
      findsOneWidget,
    );
    await tester.tap(find.text('Add to jar'));
    await tester.pumpAndSettle();
    final loaded = await loadPersistedJars(storage);
    expect(loaded.jars.single.balance, 9007199254740901);
    expect(loaded.jars.single.entries.single.amount, 9007199254740901);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 9));
  });

  testWidgets('a note-only correction preserves the original exact amount', (
    tester,
  ) async {
    final storage = MemoryStorage({
      jarsKey: serializeJars([
        jar(
          balance: 9007199254740901,
          target: maxSafeInteger,
          openingBalance: 0,
          entries: [dep(9007199254740901, '2026-01-02T00:00:00.000Z')],
        ),
      ]),
    });
    await _mount(tester, storage);
    await tester.scrollUntilVisible(
      find.text('Money added'),
      400,
      scrollable: find
          .descendant(
            of: find.byType(ListView),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await tester.tap(find.text('Money added'));
    await tester.pumpAndSettle();
    final fields = find.descendant(
      of: _sheet,
      matching: find.byType(TextField),
    );
    await tester.enterText(fields.at(2), 'Updated note');
    await tester.tap(find.text('Save correction'));
    await tester.pumpAndSettle();
    final loaded = await loadPersistedJars(storage);
    expect(loaded.jars.single.entries.single.note, 'Updated note');
    expect(loaded.jars.single.entries.single.amount, 9007199254740901);
    expect(loaded.jars.single.balance, 9007199254740901);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 9));
  });
}
