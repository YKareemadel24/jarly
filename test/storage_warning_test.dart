/// Regression coverage for rendering storage errors above the application.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jarly/state/providers.dart';
import 'package:jarly/state/savings_controller.dart';
import 'package:jarly/ui/widgets/storage_warning.dart';

class _Savings extends SavingsController {
  @override
  Future<SavingsState> build() async => const SavingsState(
    jars: [],
    ready: true,
    writable: false,
    storageError: 'Cannot save changes.',
  );
}

void main() {
  testWidgets(
    'renders a storage warning in its root Stack without parent-data errors',
    (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [savingsProvider.overrideWith(_Savings.new)],
          child: const MaterialApp(
            home: Scaffold(
              body: Stack(children: [SizedBox.expand(), StorageWarning()]),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('Cannot save changes.'), findsOneWidget);
      expect(
        find.byWidgetPredicate(
          (widget) =>
              widget is Semantics && widget.properties.liveRegion == true,
        ),
        findsOneWidget,
      );
    },
  );
}
