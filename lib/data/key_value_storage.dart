/// Tiny key/value storage abstraction so persistence logic can be tested with
/// an in-memory fake, mirroring the original app's `KeyValueStorage`.
library;

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../services/ledger_storage.dart';

abstract class KeyValueStorage {
  Future<String?> getItem(String key);
  Future<void> setItem(String key, String value);
  Future<void> removeItem(String key);
}

/// In-memory implementation for tests and as a web-friendly fallback.
class MemoryStorage implements KeyValueStorage {
  MemoryStorage([Map<String, String>? initial]) : values = {...?initial};

  final Map<String, String> values;

  @override
  Future<String?> getItem(String key) async => values[key];

  @override
  Future<void> setItem(String key, String value) async => values[key] = value;

  @override
  Future<void> removeItem(String key) async => values.remove(key);
}

/// Preferences and legacy snapshots; new ledger writes use the durable adapter.
/// Native PIN credentials remain in secure storage (see settings_repository).
class SharedPrefsStorage implements KeyValueStorage {
  SharedPrefsStorage(this._prefs);

  final SharedPreferences _prefs;

  static Future<SharedPrefsStorage> load() async =>
      SharedPrefsStorage(await SharedPreferences.getInstance());

  @override
  Future<String?> getItem(String key) async => _prefs.getString(key);

  @override
  Future<void> setItem(String key, String value) =>
      _write(_prefs.setString(key, value));

  @override
  Future<void> removeItem(String key) => _write(_prefs.remove(key));

  Future<void> _write(Future<bool> operation) async {
    try {
      if (!await operation) throw StateError('Preferences could not be saved.');
    } catch (_) {
      // The plugin updates its cache before the platform write succeeds.
      await _prefs.reload();
      rethrow;
    }
  }
}

/// Picks the right store per platform at startup. Web has no secure storage,
/// matching the original app's AsyncStorage-everywhere behavior there.
Future<KeyValueStorage> createStorage() async {
  if (kIsWeb) return createLedgerStorage(await SharedPrefsStorage.load());
  final SharedPrefsStorage preferences;
  try {
    preferences = await SharedPrefsStorage.load();
  } catch (_) {
    return MemoryStorage();
  }
  return createLedgerStorage(preferences);
}
