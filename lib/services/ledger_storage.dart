/// Routes ledger snapshots to durable storage and leaves settings in preferences.
library;

import 'dart:convert';

import '../data/key_value_storage.dart';
import '../data/savings_storage.dart' show jarsBackupKey, jarsKey;
import 'ledger_storage_native.dart'
    if (dart.library.js_interop) 'ledger_storage_web.dart'
    as impl;

Future<KeyValueStorage> createLedgerStorage(KeyValueStorage preferences) =>
    impl.createPlatformLedgerStorage(preferences);

/// Stores both ledger keys and the migration marker in one committed record.
abstract class LedgerStorage implements KeyValueStorage {
  LedgerStorage(this._preferences);

  final KeyValueStorage _preferences;
  late Map<String, String> _values;
  Future<void> _writes = Future.value();

  Future<String?> readSnapshot();
  Future<void> writeSnapshot(String value);

  Future<KeyValueStorage> initialize() async {
    final raw = await readSnapshot();
    if (raw == null) {
      final values = <String, String>{};
      for (final key in [jarsKey, jarsBackupKey]) {
        final value = await _preferences.getItem(key);
        if (value != null) values[key] = value;
      }
      // Keep originals available if migration fails before the durable commit.
      await writeSnapshot(_encode(values));
      _values = values;
    } else {
      final decoded = jsonDecode(raw);
      if (decoded is! Map || decoded['version'] != 1) {
        throw const FormatException('Invalid ledger storage version.');
      }
      final values = decoded['values'];
      if (values is! Map ||
          values.entries.any(
            (entry) => !_isLedgerKey(entry.key) || entry.value is! String,
          )) {
        throw const FormatException('Invalid ledger storage values.');
      }
      _values = Map<String, String>.from(values);
    }
    return this;
  }

  static bool _isLedgerKey(Object? key) =>
      key == jarsKey || key == jarsBackupKey;

  static String _encode(Map<String, String> values) =>
      jsonEncode({'version': 1, 'values': values});

  @override
  Future<String?> getItem(String key) async {
    if (!_isLedgerKey(key)) return _preferences.getItem(key);
    await _writes;
    return _values[key];
  }

  @override
  Future<void> setItem(String key, String value) => _isLedgerKey(key)
      ? _update(key, value)
      : _preferences.setItem(key, value);

  @override
  Future<void> removeItem(String key) =>
      _isLedgerKey(key) ? _update(key, null) : _preferences.removeItem(key);

  Future<void> _update(String key, String? value) {
    final write = _writes.then((_) async {
      final next = {..._values};
      if (value == null) {
        next.remove(key);
      } else {
        next[key] = value;
      }
      await writeSnapshot(_encode(next));
      _values = next;
    });
    _writes = write.catchError((_) {});
    return write;
  }
}
