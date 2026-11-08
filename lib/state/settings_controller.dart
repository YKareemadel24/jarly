/// Settings store: gentle-support toggles, app lock (biometrics + PIN with
/// escalating lockout), and the active currency.
///
/// Port of `lib/settings-store.tsx`. Every setter writes through to storage
/// immediately (best effort), and lock preferences failing to read keep the
/// app gate closed rather than open.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:local_auth/local_auth.dart';

import '../data/key_value_storage.dart';
import '../data/settings_repository.dart';
import 'providers.dart';

class SettingsState {
  const SettingsState({
    required this.ready,
    required this.remindersEnabled,
    required this.biometricAvailable,
    required this.biometricLockEnabled,
    required this.pinLockEnabled,
    required this.hasPin,
    required this.pinLength,
    required this.pinLockedUntil,
    required this.currency,
  });

  static const initial = SettingsState(
    ready: false,
    remindersEnabled: false,
    biometricAvailable: false,
    biometricLockEnabled: false,
    pinLockEnabled: false,
    hasPin: false,
    pinLength: null,
    pinLockedUntil: null,
    currency: 'USD',
  );

  final bool ready;

  /// Whether gentle support (reminders) is enabled.
  final bool remindersEnabled;

  /// Whether a face / fingerprint scanner exists and has enrolled data (native only).
  final bool biometricAvailable;

  /// Whether biometric unlock gates the app.
  final bool biometricLockEnabled;

  /// Whether PIN lock is enabled. Requires a PIN to have been set.
  final bool pinLockEnabled;

  /// True once a PIN has been configured.
  final bool hasPin;

  /// Number of digits in the configured PIN, or null when there is none.
  final int? pinLength;

  /// Epoch ms until which PIN attempts are throttled, or null when not throttled.
  final int? pinLockedUntil;

  /// Active currency code (ISO 4217).
  final String currency;

  SettingsState copyWith({
    bool? ready,
    bool? remindersEnabled,
    bool? biometricAvailable,
    bool? biometricLockEnabled,
    bool? pinLockEnabled,
    bool? hasPin,
    int? pinLength,
    bool clearPinLength = false,
    int? pinLockedUntil,
    bool clearPinLockedUntil = false,
    String? currency,
  }) =>
      SettingsState(
        ready: ready ?? this.ready,
        remindersEnabled: remindersEnabled ?? this.remindersEnabled,
        biometricAvailable: biometricAvailable ?? this.biometricAvailable,
        biometricLockEnabled: biometricLockEnabled ?? this.biometricLockEnabled,
        pinLockEnabled: pinLockEnabled ?? this.pinLockEnabled,
        hasPin: hasPin ?? this.hasPin,
        pinLength: clearPinLength ? null : (pinLength ?? this.pinLength),
        pinLockedUntil:
            clearPinLockedUntil ? null : (pinLockedUntil ?? this.pinLockedUntil),
        currency: currency ?? this.currency,
      );
}

class SettingsController extends AsyncNotifier<SettingsState> {
  KeyValueStorage? _storage;
  final PinRepository _pinRepository = PinRepository();

  SettingsState get _current => state.value ?? SettingsState.initial;

  @override
  Future<SettingsState> build() async {
    final storage = await ref.watch(storageProvider.future);
    _storage = storage;

    // Detect whether the device offers usable biometrics (native only). Never
    // available on the web target, so the toggle simply stays hidden there.
    var biometricAvailable = false;
    if (!kIsWeb) {
      try {
        final localAuth = LocalAuthentication();
        final hardware = await localAuth.canCheckBiometrics;
        final enrolled = (await localAuth.getAvailableBiometrics()).isNotEmpty;
        biometricAvailable = hardware && enrolled;
      } catch (_) {
        biometricAvailable = false;
      }
    }

    try {
      final remindersRaw = await storage.getItem(remindersKey);
      final biometricRaw = await storage.getItem(biometricKey);
      final pinLockRaw = await storage.getItem(pinLockKey);
      final pinRecord = await _pinRepository.readPinRecord();
      final attempts = await readAttempts(storage);
      final currencyRaw = await storage.getItem(currencyKey);

      final validCodes = supportedCurrencies.map((c) => c.code).toSet();
      final restoredCurrency =
          currencyRaw != null && validCodes.contains(currencyRaw)
              ? currencyRaw
              : 'USD';

      return SettingsState(
        ready: true,
        remindersEnabled: remindersRaw == 'true',
        biometricAvailable: biometricAvailable,
        biometricLockEnabled: biometricRaw == 'true',
        // Keep the lock policy active even if its credential is missing; the
        // gate will fail closed and explain that authentication is unavailable.
        pinLockEnabled: pinLockRaw == 'true',
        hasPin: pinRecord != null,
        pinLength: pinLengthOf(pinRecord),
        pinLockedUntil:
            attempts.lockedUntil > DateTime.now().millisecondsSinceEpoch
                ? attempts.lockedUntil
                : null,
        currency: restoredCurrency,
      );
    } catch (_) {
      // Keep the app gate closed if lock preferences could not be read.
      return SettingsState.initial.copyWith(biometricAvailable: biometricAvailable);
    }
  }

  void _write(String key, String value) {
    final storage = _storage;
    if (storage == null) return;
    storage.setItem(key, value).catchError((_) {});
  }

  void _remove(String key) {
    final storage = _storage;
    if (storage == null) return;
    storage.removeItem(key).catchError((_) {});
  }

  void setRemindersEnabled(bool next) {
    state = AsyncData(_current.copyWith(remindersEnabled: next));
    _write(remindersKey, next ? 'true' : 'false');
  }

  void setBiometricLockEnabled(bool next) {
    state = AsyncData(_current.copyWith(biometricLockEnabled: next));
    _write(biometricKey, next ? 'true' : 'false');
  }

  /// Save or change the PIN used to unlock. Returns false on invalid input.
  Future<bool> setPin(String pin) async {
    if (!RegExp(r'^\d{4,12}$').hasMatch(pin)) return false;
    try {
      await _pinRepository.writePinRecord(makePinRecord(pin));
      state = AsyncData(_current.copyWith(hasPin: true, pinLength: pin.length));
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Enable PIN lock; assumes [setPin] was called first.
  Future<bool> enablePinLock() async {
    try {
      final pin = await _pinRepository.readPinRecord();
      if (pin == null) return false;
      _write(pinLockKey, 'true');
      state = AsyncData(_current.copyWith(pinLockEnabled: true));
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Disable PIN lock and clear the stored PIN.
  Future<void> disablePinLock() async {
    state = AsyncData(_current.copyWith(pinLockEnabled: false));
    await _pinRepository.deletePinRecord();
    state = AsyncData(_current.copyWith(hasPin: false, clearPinLength: true));
    _remove(pinAttemptsKey);
    state = AsyncData(_current.copyWith(clearPinLockedUntil: true));
    _write(pinLockKey, 'false');
  }

  /// Verify a PIN attempt. "locked" means too many recent failures — the
  /// caller should back off (see [state]'s pinLockedUntil) rather than prompt
  /// again at once.
  Future<String> tryUnlock(String pin) async {
    final storage = _storage;
    if (storage == null) return 'wrong';
    final now = DateTime.now().millisecondsSinceEpoch;
    final attempts = await readAttempts(storage);
    if (attempts.lockedUntil > now) {
      state = AsyncData(_current.copyWith(pinLockedUntil: attempts.lockedUntil));
      return 'locked';
    }

    final record = await _pinRepository.readPinRecord();
    if (record == null) return 'wrong';

    if (!verifyPinRecord(record, pin)) {
      // Escalating backoff: a handful of honest mistakes costs nothing, but
      // guessing is slowed to a crawl long before a 4-digit space is exhaustible.
      final failures = attempts.failures + 1;
      final lockMs = lockoutMsFor(failures);
      final lockedUntil = lockMs > 0 ? now + lockMs : 0;
      await writeAttempts(
          storage, PinAttemptState(failures: failures, lockedUntil: lockedUntil));
      state = AsyncData(_current.copyWith(
        pinLockedUntil: lockedUntil > now ? lockedUntil : null,
      ));
      return lockedUntil > now ? 'locked' : 'wrong';
    }

    // Success: reset the throttle, and upgrade a legacy plaintext record to the
    // hashed format so the PIN no longer sits readable in storage.
    if (!record.startsWith('v1:')) {
      try {
        await _pinRepository.writePinRecord(makePinRecord(pin));
      } catch (_) {}
    }
    _remove(pinAttemptsKey);
    state = AsyncData(_current.copyWith(clearPinLockedUntil: true));
    return 'ok';
  }

  void setCurrency(String next) {
    state = AsyncData(_current.copyWith(currency: next));
    _write(currencyKey, next);
  }

  /// Prompt the platform biometric scanner. Resolves true on a successful match.
  Future<bool> authenticateWithBiometrics() async {
    if (kIsWeb) return false;
    try {
      final result = await LocalAuthentication().authenticate(
        localizedReason: 'Unlock your Saving Jar',
      );
      return result;
    } catch (_) {
      return false;
    }
  }
}
