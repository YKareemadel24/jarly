/// Tiny key/value storage abstraction so persistence logic can be tested with
/// an in-memory fake, mirroring the original app's `KeyValueStorage`.
library;

import 'package:shared_preferences/shared_preferences.dart';

import '../services/ledger_storage.dart';

abstract class KeyValueStorage {
  Future<String?> getItem(String key);
  Future<void> setItem(String key, String value);
  Future<void> removeItem(String key);
}

/// In-memory implementation for tests.
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

/// Opens the local stores, propagating initialization failure to the app root.
Future<KeyValueStorage> createStorage() async =>
    createLedgerStorage(await SharedPrefsStorage.load());
