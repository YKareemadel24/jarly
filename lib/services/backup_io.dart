/// `.jarly` backup file I/O: share-out a generated file, pick a file back in.
///
/// Port of `lib/backup-files.ts`. The platform split lives in
/// `backup_io_native.dart` (share sheet + temp file) and `backup_io_web.dart`
/// (browser download/upload), selected at compile time the standard way.
library;

import 'backup_io_web.dart'
    if (dart.library.io) 'backup_io_native.dart' as impl;

import 'package:flutter/foundation.dart' show kIsWeb;

import '../transfer/backup.dart' show maxBackupBytes;

/// 512 KB, shared with the parser's own limit.
const int backupMaxBytes = maxBackupBytes;

void checkBackupSize(int size) {
  if (size <= 0 || size > maxBackupBytes) {
    throw BackupIoException(
        'Choose a nonempty Saving Jar backup under 512 KB.');
  }
}

String backupFilename() =>
    'saving-jar-${DateTime.now().toIso8601String().replaceAll(RegExp('[:.]'), '-')}.jarly';

/// Whether the save flow goes through the browser rather than a share sheet.
bool get backupSavesViaBrowser => kIsWeb;

/// Write [text] to a `.jarly` file and hand it to the share sheet. A copy is
/// saved only if the user picks a destination. On web this triggers a download.
Future<void> saveBackupFile(String text) =>
    impl.saveBackupFile(text, backupFilename());

/// Pick a `.jarly` backup file and return its text, or null when cancelled.
Future<String?> pickBackupFile() => impl.pickBackupFile();

class BackupIoException implements Exception {
  BackupIoException(this.message);
  final String message;
  @override
  String toString() => message;
}
