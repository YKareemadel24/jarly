/// Regression tests for saving lock policy and ordinary preferences.
library;

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jarly/data/key_value_storage.dart';
import 'package:jarly/data/settings_repository.dart';
import 'package:jarly/state/providers.dart';

class _FaultyPreferences extends MemoryStorage {
  _FaultyPreferences(super.initial);

  String? failKey;

  @override
  Future<void> setItem(String key, String value) async {
    if (key == failKey) throw StateError('Injected preference write failure');
    await super.setItem(key, value);
  }
}

Future<ProviderContainer> _open(KeyValueStorage storage) async {
  final container = ProviderContainer(
    overrides: [storageProvider.overrideWith((ref) async => storage)],
  );
  addTearDown(container.dispose);
  await container.read(settingsProvider.future);
  return container;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const secure = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
  const localAuth = MethodChannel('plugins.flutter.io/local_auth');
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  String? credential;
  String? failingCredentialOperation;
  late bool biometricMatch;

  setUp(() {
    credential = makePinRecord('1234');
    failingCredentialOperation = null;
    biometricMatch = true;
    messenger.setMockMethodCallHandler(secure, (call) async {
      if (call.method == failingCredentialOperation) {
        throw PlatformException(code: 'secure-storage-unavailable');
      }
      switch (call.method) {
        case 'read':
          return credential;
        case 'write':
          credential = (call.arguments as Map)['value'] as String;
        case 'delete':
          credential = null;
        default:
          throw StateError('Unexpected credential operation');
      }
      return null;
    });
    messenger.setMockMethodCallHandler(
      localAuth,
      (call) async => switch (call.method) {
        'getAvailableBiometrics' => ['fingerprint'],
        'authenticate' => biometricMatch,
        _ => throw StateError('Unexpected biometric operation'),
      },
    );
  });

  tearDown(() {
    messenger.setMockMethodCallHandler(secure, null);
    messenger.setMockMethodCallHandler(localAuth, null);
  });

  test(
    'failed PIN flag write keeps a disabled policy and an available credential',
    () async {
      final storage = _FaultyPreferences({})..failKey = pinLockKey;
      final container = await _open(storage);
      expect(
        await container.read(settingsProvider.notifier).enablePinLock(),
        isFalse,
      );
      expect(container.read(settingsProvider).value!.pinLockEnabled, isFalse);
      expect(container.read(settingsProvider).value!.storageError, isNotNull);
      final reopened = await _open(storage);
      expect(reopened.read(settingsProvider).value!.pinLockEnabled, isFalse);
      expect(reopened.read(settingsProvider).value!.hasPin, isTrue);
    },
  );

  test(
    'PIN enable refuses a malformed or unreadable stored credential',
    () async {
      final storage = _FaultyPreferences({});
      credential = 'v1:4:invalid:invalid';
      final container = await _open(storage);
      final controller = container.read(settingsProvider.notifier);
      expect(await controller.enablePinLock(), isFalse);
      credential = makePinRecord('1234');
      failingCredentialOperation = 'read';
      expect(await controller.enablePinLock(), isFalse);
      expect(storage.values[pinLockKey], isNull);
    },
  );

  test(
    'failed PIN replacement keeps the original credential usable on restart',
    () async {
      final storage = _FaultyPreferences({pinLockKey: 'true'});
      final container = await _open(storage);
      failingCredentialOperation = 'write';
      expect(
        await container.read(settingsProvider.notifier).setPin('567890'),
        isFalse,
      );
      final reopened = await _open(storage);
      expect(reopened.read(settingsProvider).value!.pinLength, 4);
      expect(
        await reopened.read(settingsProvider.notifier).tryUnlock('1234'),
        'ok',
      );
    },
  );

  test(
    'failed PIN disabling write preserves the enabled policy and old PIN',
    () async {
      final storage = _FaultyPreferences({pinLockKey: 'true'})
        ..failKey = pinLockKey;
      final container = await _open(storage);
      expect(
        await container.read(settingsProvider.notifier).disablePinLock(),
        isFalse,
      );
      expect(container.read(settingsProvider).value!.pinLockEnabled, isTrue);
      expect(container.read(settingsProvider).value!.storageError, isNotNull);
      expect(verifyPinRecord(credential!, '1234'), isTrue);
      final reopened = await _open(storage);
      expect(reopened.read(settingsProvider).value!.pinLockEnabled, isTrue);
      expect(
        await reopened.read(settingsProvider.notifier).tryUnlock('1234'),
        'ok',
      );
    },
  );

  test('credential cleanup failure leaves PIN lock off and reports the retained record', () async {
    final storage = _FaultyPreferences({pinLockKey: 'true'});
    final container = await _open(storage);
    failingCredentialOperation = 'delete';
    expect(
      await container.read(settingsProvider.notifier).disablePinLock(),
      isTrue,
    );
    expect(storage.values[pinLockKey], 'false');
    expect(container.read(settingsProvider).value!.pinLockEnabled, isFalse);
    expect(container.read(settingsProvider).value!.hasPin, isTrue);
    expect(container.read(settingsProvider).value!.storageError, isNotNull);
    final reopened = await _open(storage);
    expect(reopened.read(settingsProvider).value!.pinLockEnabled, isFalse);
    expect(reopened.read(settingsProvider).value!.hasPin, isTrue);
  });

  test('failed biometric policy writes leave the displayed and restarted policy unchanged', () async {
    final storage = _FaultyPreferences({})..failKey = biometricKey;
    final container = await _open(storage);
    expect(container.read(settingsProvider).value!.biometricAvailable, isTrue);
    expect(
      await container
          .read(settingsProvider.notifier)
          .setBiometricLockEnabled(true),
      isFalse,
    );
    expect(
      container.read(settingsProvider).value!.biometricLockEnabled,
      isFalse,
    );
    final reopened = await _open(storage);
    expect(
      reopened.read(settingsProvider).value!.biometricLockEnabled,
      isFalse,
    );
  });

  test(
    'an unsuccessful biometric verification does not enable protection',
    () async {
      final storage = _FaultyPreferences({});
      final container = await _open(storage);
      biometricMatch = false;
      expect(
        await container
            .read(settingsProvider.notifier)
            .setBiometricLockEnabled(true),
        isFalse,
      );
      expect(storage.values[biometricKey], isNull);
      expect(
        container.read(settingsProvider).value!.biometricLockEnabled,
        isFalse,
      );
    },
  );

  test('ordinary preference failure preserves the displayed value and allows a retry', () async {
    final storage = _FaultyPreferences({currencyKey: 'USD'})
      ..failKey = currencyKey;
    final container = await _open(storage);
    final controller = container.read(settingsProvider.notifier);
    expect(await controller.setCurrency('EUR'), isFalse);
    expect(container.read(settingsProvider).value!.currency, 'USD');
    expect(container.read(settingsProvider).value!.storageError, isNotNull);
    storage.failKey = null;
    expect(await controller.setCurrency('EUR'), isTrue);
    expect(container.read(settingsProvider).value!.currency, 'EUR');
    expect(container.read(settingsProvider).value!.storageError, isNull);
    expect(
      (await _open(storage)).read(settingsProvider).value!.currency,
      'EUR',
    );
  });
}
