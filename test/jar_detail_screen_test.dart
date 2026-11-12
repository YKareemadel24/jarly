/// Regression coverage for amount previews and transaction corrections.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:jarly/data/key_value_storage.dart';
import 'package:jarly/data/savings_storage.dart';
import 'package:jarly/domain/domain.dart';
import 'package:jarly/state/providers.dart';
import 'package:jarly/state/settings_controller.dart';
import 'package:jarly/ui/screens/jar_detail_screen.dart';
import 'package:jarly/ui/screens/new_jar_screen.dart';
import 'package:jarly/ui/widgets/pressable.dart';
import 'package:jarly/ui/widgets/app_toast.dart';
import 'package:jarly/ui/widgets/sheet_scaffold.dart';

import 'helpers.dart';

class _Settings extends SettingsController {
  @override
  Future<SettingsState> build() async =>
      SettingsState.initial.copyWith(ready: true);
}

class _BlockedStorage extends MemoryStorage {
  _BlockedStorage(super.initial);

  Completer<void>? write;

  @override
  Future<void> setItem(String key, String value) async {
    if (key == jarsKey && write != null) await write!.future;
    await super.setItem(key, value);
  }
}

Future<void> _mount(
  WidgetTester tester,
  KeyValueStorage storage, {
  GoRouter? router,
}) async {
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
      child: router != null
          ? MaterialApp.router(routerConfig: router)
          : const MaterialApp(
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

Finder get _draftFields =>
    find.descendant(of: _sheet, matching: find.byType(TextField));

Future<void> _openTransaction(WidgetTester tester, String label) async {
  final button = find.byWidgetPredicate(
    (widget) => widget is Pressable && widget.semantics == label,
  );
  await tester.ensureVisible(button);
  await tester.tap(button);
  await tester.pumpAndSettle();
}

Future<void> _checkPastedAmounts(
  WidgetTester tester,
  Finder field,
  Finder submit, {
  Finder? scope,
}) async {
  for (final raw in ['1,234', '-12', '1.2345']) {
    await tester.enterText(field, raw);
    await tester.pump();
    expect(tester.widget<TextField>(field).controller!.text, raw);
    await tester.tap(submit);
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(field).controller!.text, raw);
    final message = find.textContaining('Use a positive amount');
    expect(
      scope == null ? message : find.descendant(of: scope, matching: message),
      findsOneWidget,
    );
  }
  await tester.enterText(field, '1,234.56');
  await tester.pump();
}

void main() {
  testWidgets('editing a recurring amount retains its saved cadence', (
    tester,
  ) async {
    final storage = MemoryStorage({
      jarsKey: serializeJars([
        jar(
          recurring: const RecurringRule(
            amount: 2500,
            cadence: 'monthly',
            paused: true,
          ),
        ),
      ]),
    });
    await _mount(tester, storage);
    await _openTransaction(tester, 'Edit recurring deposit');
    await tester.enterText(_draftFields.first, '30.00');
    await tester.pump();
    await tester.tap(
      find.descendant(of: _sheet, matching: find.text('Save schedule')),
    );
    await tester.pumpAndSettle();
    final rule = (await loadPersistedJars(storage)).jars.single.recurring!;
    expect(rule.amount, 3000);
    expect(rule.cadence, 'monthly');
    expect(rule.paused, isTrue);
  });

  for (final editor in [
    'deposit',
    'withdrawal',
    'target',
    'schedule',
    'correction',
  ]) {
    testWidgets(
      '$editor validates pasted amounts without changing their value',
      (tester) async {
        final storage = MemoryStorage({
          jarsKey: serializeJars([
            jar(
              balance: 200000,
              target: 1000000,
              openingBalance: 190000,
              entries: [dep(10000, '2025-01-01T12:00:00.000Z')],
              recurring: editor == 'schedule'
                  ? const RecurringRule(
                      amount: 100,
                      cadence: 'weekly',
                      paused: true,
                    )
                  : null,
            ),
          ]),
        });
        await _mount(tester, storage);
        final submit = switch (editor) {
          'deposit' => 'Add to jar',
          'withdrawal' => 'Confirm withdrawal',
          'target' => 'Save changes',
          'schedule' => 'Save schedule',
          _ => 'Save correction',
        };
        switch (editor) {
          case 'deposit':
            await _openTransaction(tester, 'Deposit into Japan trip');
          case 'withdrawal':
            await _openTransaction(tester, 'Withdraw from Japan trip');
          case 'target':
            await _openTransaction(tester, 'Jar options');
            await tester.tap(find.text('Edit jar'));
            await tester.pumpAndSettle();
          case 'schedule':
            await _openTransaction(tester, 'Edit recurring deposit');
          case 'correction':
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
        }
        final field = _draftFields.at(editor == 'target' ? 1 : 0);
        final button = find.descendant(of: _sheet, matching: find.text(submit));
        await _checkPastedAmounts(tester, field, button, scope: _sheet);
        if (editor == 'deposit' || editor == 'withdrawal') {
          await tester.enterText(field, '1234,56');
          await tester.pump();
          expect(
            find.descendant(
              of: _sheet,
              matching: find.textContaining(
                editor == 'deposit' ? r'$3,234.56' : r'$765.44',
              ),
            ),
            findsOneWidget,
          );
        }
        await tester.tap(button);
        await tester.pumpAndSettle();
        final saved = (await loadPersistedJars(storage)).jars.single;
        expect(switch (editor) {
          'target' => saved.target,
          'schedule' => saved.recurring!.amount,
          _ => saved.entries.first.amount,
        }, 123456);
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump(const Duration(seconds: 9));
      },
    );
  }

  for (final deposit in [true, false]) {
    final direction = deposit ? directionDeposit : directionWithdrawal;
    testWidgets('a rendered $direction confirmation can commit only once', (
      tester,
    ) async {
      final storage = MemoryStorage({
        jarsKey: serializeJars([jar(balance: 10000, target: 100000)]),
      });
      await _mount(tester, storage);
      await _openTransaction(
        tester,
        deposit ? 'Deposit into Japan trip' : 'Withdraw from Japan trip',
      );
      await tester.enterText(_draftFields.first, '10');
      await tester.pump();
      final label = find.descendant(
        of: _sheet,
        matching: find.text(deposit ? 'Add to jar' : 'Confirm withdrawal'),
      );
      final confirm = tester
          .widget<Pressable>(
            find.ancestor(of: label, matching: find.byType(Pressable)),
          )
          .onTap;
      confirm();
      confirm();
      await tester.pumpAndSettle();
      expect(
        (await loadPersistedJars(storage)).jars.single.entries.single.direction,
        direction,
      );
      expect(
        find.byWidgetPredicate(
          (widget) => widget is AppToast && widget.visible,
        ),
        findsOneWidget,
      );

      confirm();
      await tester.pumpAndSettle();
      final saved = (await loadPersistedJars(storage)).jars.single;
      expect(saved.entries, hasLength(1));
      expect(saved.balance, deposit ? 11000 : 9000);
      expect(saved.entries.single.amount, 1000);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(seconds: 9));
    });
  }

  testWidgets('cancelled deposit does not prefill a later withdrawal', (
    tester,
  ) async {
    final storage = MemoryStorage({
      jarsKey: serializeJars([jar(balance: 10000)]),
    });
    await _mount(tester, storage);
    await _openTransaction(tester, 'Deposit into Japan trip');
    await tester.enterText(_draftFields.first, '10');
    await tester.enterText(_draftFields.at(1), 'Cancelled note');
    await tester.pump();
    await tester.tap(
      find.descendant(of: _sheet, matching: find.text('Cancel')),
    );
    await tester.pumpAndSettle();
    await _openTransaction(tester, 'Withdraw from Japan trip');
    expect(
      tester.widget<TextField>(_draftFields.first).controller!.text,
      isEmpty,
    );
    expect(
      tester.widget<TextField>(_draftFields.at(1)).controller!.text,
      isEmpty,
    );
    expect((await loadPersistedJars(storage)).jars.single.entries, isEmpty);
  });

  testWidgets('jar creation keeps the draft until a successful retry', (
    tester,
  ) async {
    final storage = _BlockedStorage({
      jarsKey: serializeJars([jar()]),
    });
    final router = GoRouter(
      initialLocation: '/new',
      routes: [
        GoRoute(
          path: '/new',
          builder: (context, state) =>
              const Scaffold(body: SizedBox.expand(child: NewJarScreen())),
        ),
        GoRoute(
          path: '/jar/:id',
          builder: (context, state) =>
              const Scaffold(body: Text('Created jar')),
        ),
      ],
    );
    addTearDown(router.dispose);
    await _mount(tester, storage, router: router);
    await tester.enterText(find.byType(TextField).first, 'New trip');
    await tester.pump();
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    await _checkPastedAmounts(
      tester,
      find.byType(TextField).first,
      find.text('Create my jar'),
    );

    storage.write = Completer<void>();
    await tester.tap(find.text('Create my jar'));
    await tester.pump();
    expect(find.text('Saving…'), findsOneWidget);
    expect(router.routeInformationProvider.value.uri.path, '/new');
    expect((await loadPersistedJars(storage)).jars, hasLength(1));
    storage.write!.completeError(StateError('Storage unavailable'));
    await tester.pumpAndSettle();
    expect(find.textContaining('could not be saved'), findsOneWidget);
    expect(find.text('New trip'), findsOneWidget);
    expect(find.text('1,234.56'), findsOneWidget);
    expect(router.routeInformationProvider.value.uri.path, '/new');

    storage.write = null;
    await tester.tap(find.text('Create my jar'));
    await tester.pumpAndSettle();
    expect(find.text('Created jar'), findsOneWidget);
    final jars = (await loadPersistedJars(storage)).jars;
    expect(jars, hasLength(2));
    expect(jars.where((jar) => jar.name == 'New trip').single.target, 123456);
  });

  testWidgets('failed deposit keeps its draft and retries one saved entry', (
    tester,
  ) async {
    final storage = _BlockedStorage({
      jarsKey: serializeJars([jar(balance: 10000, target: 100000)]),
    });
    await _mount(tester, storage);
    final haptics = <Object?>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        if (call.method == 'HapticFeedback.vibrate') {
          haptics.add(call.arguments);
        }
        return null;
      },
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        null,
      ),
    );
    final deposit = find.byWidgetPredicate(
      (widget) =>
          widget is Pressable && widget.semantics == 'Deposit into Japan trip',
    );
    await tester.ensureVisible(deposit);
    await tester.tap(deposit);
    await tester.pumpAndSettle();
    final fields = find.descendant(
      of: _sheet,
      matching: find.byType(TextField),
    );
    await tester.enterText(fields.first, '25');
    await tester.enterText(fields.at(1), 'Keep this draft');
    await tester.pump();
    haptics.clear();
    storage.write = Completer<void>();
    await tester.tap(find.text('Add to jar'));
    await tester.pump();
    expect(find.text('Saving…'), findsOneWidget);
    expect(
      find.descendant(of: _sheet, matching: find.text('Add to jar')),
      findsOneWidget,
    );
    expect(haptics, isEmpty);
    expect(
      find.byWidgetPredicate((widget) => widget is AppToast && widget.visible),
      findsNothing,
    );
    expect((await loadPersistedJars(storage)).jars.single.balance, 10000);

    storage.write!.completeError(StateError('Storage unavailable'));
    await tester.pumpAndSettle();
    expect(find.text('Saving…'), findsNothing);
    expect(find.text('Keep this draft'), findsOneWidget);
    expect(haptics, isEmpty);
    expect((await loadPersistedJars(storage)).jars.single.balance, 10000);
    expect(find.textContaining('could not be saved'), findsWidgets);

    storage.write = null;
    await tester.tap(find.text('Add to jar'));
    await tester.pumpAndSettle();
    final saved = (await loadPersistedJars(storage)).jars.single;
    expect(saved.balance, 12500);
    expect(saved.entries.single.amount, 2500);
    expect(saved.entries.single.note, 'Keep this draft');
    expect(haptics, ['HapticFeedbackType.mediumImpact']);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 9));
  });

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
