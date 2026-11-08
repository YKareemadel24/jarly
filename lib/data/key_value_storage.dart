/// Tiny key/value storage abstraction so persistence logic can be tested with
/// an in-memory fake, mirroring the original app's `KeyValueStorage`.
library;

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

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

/// SharedPreferences-backed store used on every platform; on native devices
/// the PIN credential is kept in secure storage instead (see pin_repository).
class SharedPrefsStorage implements KeyValueStorage {
  SharedPrefsStorage(this._prefs);

  final SharedPreferences _prefs;

  static Future<SharedPrefsStorage> load() async =>
      SharedPrefsStorage(await SharedPreferences.getInstance());

  @override
  Future<String?> getItem(String key) async => _prefs.getString(key);

  @override
  Future<void> setItem(String key, String value) async {
    await _prefs.setString(key, value);
  }

  @override
  Future<void> removeItem(String key) async {
    await _prefs.remove(key);
  }
}

/// Picks the right store per platform at startup. Web has no secure storage,
/// matching the original app's AsyncStorage-everywhere behavior there.
Future<KeyValueStorage> createStorage() async {
  if (kIsWeb) return SharedPrefsStorage.load();
  try {
    return await SharedPrefsStorage.load();
  } catch (_) {
    return MemoryStorage();
  }
}
