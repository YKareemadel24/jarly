/// Commits native ledger records with a flushed sibling file and replacement.
library;

import 'dart:io';

import 'package:path_provider/path_provider.dart';

import '../data/key_value_storage.dart';
import 'ledger_storage.dart';

Future<KeyValueStorage> createPlatformLedgerStorage(
  KeyValueStorage preferences,
) async {
  final directory = await getApplicationSupportDirectory();
  return FileLedgerStorage(
    File('${directory.path}/saving-jar-ledger.json'),
    preferences,
  ).initialize();
}

/// Acknowledges a file-system flush followed by replacement. Dart does not expose
/// a parent-directory fsync here; hardware power-loss durability is not verified.
class FileLedgerStorage extends LedgerStorage {
  FileLedgerStorage(this.file, super.preferences);

  final File file;

  @override
  Future<String?> readSnapshot() async {
    try {
      return await file.readAsString();
    } on PathNotFoundException {
      return null;
    }
  }

  @override
  Future<void> writeSnapshot(String value) async {
    await file.parent.create(recursive: true);
    final pending = File('${file.path}.pending');
    await pending.writeAsString(value, flush: true);
    // A pending file is never read: only the completed replacement commits it.
    await pending.rename(file.path);
  }
}
