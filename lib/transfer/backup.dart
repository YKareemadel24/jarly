/// `.jarly` backup envelopes.
///
/// A backup is the transfer frames wrapped in a self-describing JSON file, so
/// the same codec drives QR transfer and file backup. Parsing validates
/// everything twice — once here, once again at commit time against fresh state.
library;

import 'dart:convert';

import '../domain/jar.dart';
import 'merge.dart';
import 'transfer.dart';

const int maxBackupBytes = 512 * 1024;

class BackupSummary {
  const BackupSummary({
    required this.jars,
    required this.entries,
    required this.archived,
    required this.totalMinor,
  });
  final int jars;
  final int entries;
  final int archived;

  /// Active total as a decimal string, safe beyond the JSON integer range.
  final String totalMinor;
}

class Backup {
  const Backup({
    required this.frames,
    required this.snapshot,
    required this.summary,
  });
  final List<String> frames;
  final TransferSnapshot snapshot;
  final BackupSummary summary;
}

class BackupParseException implements Exception {
  BackupParseException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Parse and fully validate a `.jarly` backup file's text.
Backup parseBackup(String text) {
  if (text.length > maxBackupBytes) {
    throw BackupParseException(
      'This backup is too large. Choose a file under 512 KB.',
    );
  }
  Object? value;
  try {
    value = jsonDecode(text);
  } catch (_) {
    throw BackupParseException(
      'This file is not a readable Saving Jar backup.',
    );
  }
  if (value is! Map) {
    throw BackupParseException('This file is not a Saving Jar backup.');
  }
  final data = value.cast<String, dynamic>();
  if (data['format'] != 'jarly-backup' || data['version'] != 1) {
    throw BackupParseException(
      'This backup format is not supported. It may need a newer app.',
    );
  }
  final framesRaw = data['frames'];
  if (framesRaw is! List ||
      framesRaw.isEmpty ||
      framesRaw.length > maxTransferFrames ||
      framesRaw.any(
        (frame) => frame is! String || frame.length > maxTransferFrameLength,
      )) {
    throw BackupParseException(
      'This backup contains invalid or excessive transfer data.',
    );
  }
  final frames = framesRaw.cast<String>();
  final assembly = decodeTransferFrames(frames);
  if (assembly?.error != null) throw BackupParseException(assembly!.error!);
  if (assembly?.snapshot == null) {
    throw BackupParseException('This backup is incomplete or damaged.');
  }
  if (assembly!.have.length + assembly.duplicates != frames.length) {
    throw BackupParseException('This backup contains damaged transfer data.');
  }
  final snapshot = assembly.snapshot!;
  if (snapshot.currency == null) {
    throw BackupParseException('This backup does not identify its currency.');
  }
  final validated = mergeTransferJars(
    [],
    snapshot.jars,
    snapshot.currency,
    snapshot.currency,
  );
  if (validated.error != null) throw BackupParseException(validated.error!);
  return Backup(
    frames: frames,
    snapshot: snapshot,
    summary: BackupSummary(
      jars: snapshot.jars.length,
      entries: snapshot.jars.fold<int>(
        0,
        (total, jar) => total + jar.entries.length,
      ),
      archived: snapshot.jars.where((jar) => jar.isArchived).length,
      totalMinor: snapshot.jars
          .fold<BigInt>(
            BigInt.zero,
            (total, jar) => total + BigInt.from(jar.balance),
          )
          .toString(),
    ),
  );
}

/// Serialize frames into a backup file, round-trip validating itself.
String createBackup(List<String> frames) {
  final text = jsonEncode({
    'format': 'jarly-backup',
    'version': 1,
    'frames': frames,
  });
  parseBackup(text);
  return text;
}

/// Dry-run the merge for the restore preview UI.
MergeResult previewBackup(Backup backup, List<Jar> current, String currency) =>
    mergeTransferJars(
      current,
      backup.snapshot.jars,
      backup.snapshot.currency,
      currency,
    );
