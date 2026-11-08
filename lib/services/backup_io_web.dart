/// Web backup I/O: browser download for exports, `file_picker` for imports.
library;

import 'dart:js_interop';

import 'package:file_picker/file_picker.dart';
import 'package:web/web.dart' as web;

import 'backup_io.dart';

Future<void> saveBackupFile(String text, String filename) async {
  // A fresh anchor per save keeps repeated exports working; browsers revoke
  // the object URL once the download settles.
  final blob = web.Blob([text.toJS].toJS, web.BlobPropertyBag(type: 'application/json'));
  final url = web.URL.createObjectURL(blob);
  final anchor = web.HTMLAnchorElement()
    ..href = url
    ..download = filename;
  anchor.click();
  web.URL.revokeObjectURL(url);
}

Future<String?> pickBackupFile() async {
  final file = await FilePicker.pickFile(
    type: FileType.custom,
    allowedExtensions: ['jarly', 'json'],
  );
  if (file == null) return null; // cancelled
  final xfile = file.xFile;
  checkBackupSize(await xfile.length());
  return xfile.readAsString();
}
