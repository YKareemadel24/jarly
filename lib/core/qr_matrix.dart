/// QR encoding, on device — port of `lib/qr.ts` onto the `qr` package.
///
/// Wraps the encoder down to the one thing the app needs: a boolean matrix of
/// modules. The wire format and rendering never depend on how the encoder
/// picks versions or masks.
library;

import 'package:qr/qr.dart';

class QrMatrixData {
  const QrMatrixData({required this.modules, required this.count});

  /// Row-major grid; `true` means a dark module.
  final List<List<bool>> modules;

  /// Modules per side, excluding the quiet zone.
  final int count;
}

/// Encode `value`, or null when it cannot be encoded (for example, when it is
/// longer than the largest supported symbol).
QrMatrixData? qrMatrix(String value) {
  if (value.isEmpty) return null;
  try {
    // "M" tolerates roughly 15% damage, which is the right trade for a code
    // read off a screen at arm's length: enough slack for a smudge, still
    // compact.
    final code = QrCode(
      payload: QrPayload.fromString(value),
      errorCorrectLevel: QrErrorCorrectLevel.medium,
    );
    final image = QrImage(code);
    final size = image.moduleCount;
    return QrMatrixData(
      count: size,
      modules: [
        for (var y = 0; y < size; y++)
          [for (var x = 0; x < size; x++) image.isDark(y, x)],
      ],
    );
  } catch (_) {
    return null;
  }
}
