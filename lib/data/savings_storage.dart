/// Jar persistence: versioned keys, validation on every read, a rolling backup
/// copy before each write, and a single-flight write queue.
///
/// Faithful port of `lib/savings-storage.ts`, including the corrupt-data
/// policy: damaged current data is kept available for manual recovery instead
/// of being replaced, and the store surfaces a read-only mode.
library;

import 'dart:convert';

import '../domain/domain.dart';
import 'key_value_storage.dart';

const String jarsKey = 'saving-jar:v3';
const String jarsBackupKey = 'saving-jar:v3:backup';
const List<String> legacyJarsKeys = ['saving-jar:v2', 'saving-jar:v1'];

class LoadedJars {
  const LoadedJars({required this.jars, required this.writable});
  final List<Jar> jars;
  final bool writable;
}

/// Parse and validate a stored jar list. Returns null for anything damaged.
List<Jar>? parseJars(String? raw, {bool legacy = false}) {
  if (raw == null) return null;
  try {
    final dynamic parsed = jsonDecode(raw);
    if (parsed is! List) return null;
    if (parsed.any((item) => item is! Map || (item['id'] is! String))) {
      return null;
    }
    final jars = parsed
        .whereType<Map>()
        .map(
          (jar) =>
              normaliseJar(jar.cast<String, dynamic>(), scaleToMinor: legacy),
        )
        .toList();
    if (jars.any((jar) => !validStoredJar(jar))) return null;
    final activeTotal = jars
        .where((jar) => !jar.isArchived)
        .fold<int>(0, (total, jar) => total + jar.balance);
    if (!isSafeInteger(activeTotal)) return null;
    return jars;
  } catch (_) {
    return null;
  }
}

bool validStoredJar(Jar jar) {
  return isSafeInteger(jar.target) &&
      jar.target > 0 &&
      isSafeInteger(jar.balance) &&
      jar.balance >= 0 &&
      (jar.openingBalance == null ||
          (isSafeInteger(jar.openingBalance!) && jar.openingBalance! >= 0)) &&
      validEntryAudit(jar.entries) &&
      (jar.reminder == null || isValidJarReminder(jar.reminder)) &&
      jar.entries.every(
        (entry) =>
            isSafeInteger(entry.amount) &&
            entry.amount > 0 &&
            (entry.direction == directionDeposit ||
                entry.direction == directionWithdrawal) &&
            DateTime.tryParse(entry.at) != null,
      ) &&
      (jar.recurring == null ||
          (isSafeInteger(jar.recurring!.amount) && jar.recurring!.amount > 0));
}

/// Load the current jar list, falling back to the backup copy and then the
/// legacy v2/v1 stores.
Future<LoadedJars> loadPersistedJars(KeyValueStorage storage) async {
  final currentRaw = await storage.getItem(jarsKey);
  final current = parseJars(currentRaw);
  if (current != null) return LoadedJars(jars: current, writable: true);

  final backup = parseJars(await storage.getItem(jarsBackupKey));
  if (backup != null) return LoadedJars(jars: backup, writable: true);

  for (final key in legacyJarsKeys) {
    final legacy = parseJars(await storage.getItem(key), legacy: true);
    if (legacy != null && legacy.isNotEmpty) {
      return LoadedJars(jars: legacy, writable: true);
    }
  }

  // Keep corrupt current data available for manual recovery instead of replacing it.
  return LoadedJars(jars: [], writable: currentRaw == null);
}

/// Serialize jars for storage.
String serializeJars(List<Jar> jars) =>
    jsonEncode([for (final jar in jars) jar.toJson()]);

/// Serializes writes through a single-flight queue: each write first copies
/// the existing good value to the backup key, then writes the new JSON. Over
///lapping calls resolve in order and the latest snapshot always wins.
class JarsPersister {
  Future<void> _writeQueue = Future.value();

  Future<void> persist(KeyValueStorage storage, List<Jar> jars) {
    final write = _writeQueue.then((_) async {
      final previous = await storage.getItem(jarsKey);
      if (previous != null && parseJars(previous) != null) {
        await storage.setItem(jarsBackupKey, previous);
      }
      await storage.setItem(jarsKey, serializeJars(jars));
    });
    _writeQueue = write.catchError((_) {});
    return write;
  }
}
