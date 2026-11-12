/// Regression coverage for failed preference writes at the storage boundary.
library;

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jarly/data/key_value_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('plugins.flutter.io/shared_preferences');
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

  for (final remove in [false, true]) {
    test(
      'reports a false ${remove ? 'remove' : 'set'} result and retains the saved value',
      () async {
        SharedPreferences.resetStatic();
        messenger.setMockMethodCallHandler(channel, (call) async {
          if (call.method == 'getAll') return {'flutter.key': 'saved'};
          if (call.method == 'setString' || call.method == 'remove') {
            return false;
          }
          throw StateError('Unexpected storage call: ${call.method}');
        });
        addTearDown(() {
          messenger.setMockMethodCallHandler(channel, null);
          SharedPreferences.resetStatic();
        });
        final storage = await SharedPrefsStorage.load();
        await expectLater(
          remove
              ? storage.removeItem('key')
              : storage.setItem('key', 'unsaved'),
          throwsStateError,
        );
        expect(await storage.getItem('key'), 'saved');
      },
    );
  }
}
