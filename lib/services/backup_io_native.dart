/// Native backup I/O: temp file + system share sheet, and file_picker to read.
library;

import 'dart:io' as io;

import 'package:file_picker/file_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import 'backup_io.dart';

Future<void> saveBackupFile(String text, String filename) async {
  final dir = await getTemporaryDirectory();
  final file = io.File('${dir.path}/$filename');
  await file.writeAsString(text);
  checkBackupSize(await file.length());
  await SharePlus.instance.share(ShareParams(
    files: [XFile(file.path, mimeType: 'application/json')],
    subject: 'Save your Saving Jar backup',
  ));
  // Dismissing the sheet is not a failure — a copy is saved only when the
  // user actually chose a destination, which the notice on the panel explains.
}

Future<String?> pickBackupFile() async {
  final picked = await FilePicker.pickFile(type: FileType.any);
  if (picked == null) return null; // cancelled
  final bytes = picked.path != null
      ? await io.File(picked.path!).readAsBytes()
      : await picked.xFile.readAsBytes();
  checkBackupSize(bytes.length);
  return String.fromCharCodes(bytes);
}
