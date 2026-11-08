/// Settings persistence: storage keys, supported currencies, and the PIN
/// credential format.
///
/// Stored PIN record: `v1:<length>:<saltHex>:<sha256(salt:pin)>`.
///
/// The PIN is never stored in plaintext. It is a device-local convenience lock
/// rather than a credential, so a salted SHA-256 (not an online password hash)
/// is the proportionate primitive; the attempt throttle in the settings
/// controller is what actually blunts guessing. Records written before hashing
/// was introduced are bare plaintext PINs: they still verify, and are upgraded
/// on the next success.
library;

import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'key_value_storage.dart';

const String remindersKey = 'saving-jar:reminders';
const String biometricKey = 'saving-jar:biometric-lock';
const String pinLockKey = 'saving-jar:pin-lock';
const String securePinKey = 'saving-jar.app-lock.pin';
const String pinAttemptsKey = 'saving-jar:pin-attempts';
const String currencyKey = 'saving-jar:currency';
const String appearanceKey = 'saving-jar:appearance';

class SupportedCurrency {
  const SupportedCurrency(this.code, this.name, this.symbol);
  final String code;
  final String name;
  final String symbol;
}

const List<SupportedCurrency> supportedCurrencies = [
  SupportedCurrency('USD', 'US Dollar', r'$'),
  SupportedCurrency('EUR', 'Euro', '€'),
  SupportedCurrency('GBP', 'British Pound', '£'),
  SupportedCurrency('EGP', 'Egyptian Pound', 'E£'),
  SupportedCurrency('SAR', 'Saudi Riyal', 'SR'),
  SupportedCurrency('AED', 'UAE Dirham', 'AED'),
  SupportedCurrency('JPY', 'Japanese Yen', '¥'),
  SupportedCurrency('INR', 'Indian Rupee', '₹'),
  SupportedCurrency('CAD', 'Canadian Dollar', r'C$'),
  SupportedCurrency('AUD', 'Australian Dollar', r'A$'),
];

const int minPinLength = 4;
const int maxPinLength = 12;

/// Consecutive failures tolerated before the lock starts imposing delays.
const int pinFreeAttempts = 5;

/// Escalating lockout durations once the free attempts are exhausted.
const List<int> pinLockoutScheduleMs = [30000, 60000, 5 * 60000, 15 * 60000];

/// Lockout duration for a given consecutive-failure count (0 = no lockout).
int lockoutMsFor(int failures) {
  if (failures < pinFreeAttempts) return 0;
  return pinLockoutScheduleMs[
      (failures - pinFreeAttempts).clamp(0, pinLockoutScheduleMs.length - 1)];
}

String _hex(List<int> bytes) =>
    bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();

String hashPin(String pin, String saltHex) =>
    sha256.convert(utf8.encode('$saltHex:$pin')).toString();

String makePinRecord(String pin, {Random? random}) {
  final salt = _hex(List.generate(16, (_) => (random ?? Random.secure()).nextInt(256)));
  final hash = hashPin(pin, salt);
  return 'v1:${pin.length}:$salt:$hash';
}

bool verifyPinRecord(String record, String pin) {
  if (!record.startsWith('v1:')) return record == pin; // legacy plaintext
  final parts = record.split(':');
  final salt = parts.length > 2 ? parts[2] : '';
  final hash = parts.length > 3 ? parts[3] : '';
  if (salt.isEmpty || hash.isEmpty) return false;
  return hashPin(pin, salt) == hash;
}

/// Number of digits in the stored PIN, or null when there is none.
int? pinLengthOf(String? record) {
  if (record == null) return null;
  if (record.startsWith('v1:')) {
    final length = int.tryParse(record.split(':')[1]);
    return length != null && length > 0 ? length : null;
  }
  return record.length; // legacy plaintext record
}

class PinAttemptState {
  const PinAttemptState({required this.failures, required this.lockedUntil});
  final int failures;
  final int lockedUntil;

  Map<String, dynamic> toJson() => {'failures': failures, 'lockedUntil': lockedUntil};

  static PinAttemptState fromJson(Map<String, dynamic> json) => PinAttemptState(
        failures: (json['failures'] as num?)?.toInt() ?? 0,
        lockedUntil: (json['lockedUntil'] as num?)?.toInt() ?? 0,
      );
}

/// The PIN credential lives in secure storage on native and in plain key/value
/// storage on web, exactly like expo-secure-store + AsyncStorage before it.
class PinRepository {
  PinRepository({FlutterSecureStorage? secure})
      : _secure = secure ?? const FlutterSecureStorage();

  final FlutterSecureStorage _secure;

  Future<void> writePinRecord(String record) async {
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(securePinKey, record);
    } else {
      await _secure.write(key: securePinKey, value: record);
    }
  }

  Future<String?> readPinRecord() async {
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getString(securePinKey);
    }
    try {
      return await _secure.read(key: securePinKey);
    } catch (_) {
      return null;
    }
  }

  Future<void> deletePinRecord() async {
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(securePinKey);
    } else {
      try {
        await _secure.delete(key: securePinKey);
      } catch (_) {}
    }
  }
}

PinAttemptState parseAttempts(String? raw) {
  if (raw == null) return const PinAttemptState(failures: 0, lockedUntil: 0);
  try {
    final dynamic parsed = jsonDecode(raw);
    if (parsed is Map &&
        parsed['failures'] is num &&
        parsed['lockedUntil'] is num) {
      return PinAttemptState.fromJson(parsed.cast<String, dynamic>());
    }
  } catch (_) {
    // A corrupt record just means the throttle starts over.
  }
  return const PinAttemptState(failures: 0, lockedUntil: 0);
}

Future<PinAttemptState> readAttempts(KeyValueStorage storage) async =>
    parseAttempts(await storage.getItem(pinAttemptsKey));

Future<void> writeAttempts(KeyValueStorage storage, PinAttemptState state) async {
  try {
    await storage.setItem(pinAttemptsKey, jsonEncode(state.toJson()));
  } catch (_) {
    // Throttle persistence is best-effort.
  }
}
