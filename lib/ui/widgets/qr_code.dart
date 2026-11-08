/// A QR code drawn as one vector path, port of `components/qr-code.tsx`.
///
/// The dark modules are emitted as a single path rather than one rect per
/// module: a transfer frame runs to roughly a thousand modules, and a thousand
/// separate widgets is enough to visibly stall the animation frame that shows
/// it. One painter keeps the tree flat no matter how dense the code gets.
///
/// The quiet zone is part of the symbol: scanners need the margin, so it is
/// drawn here rather than left to whatever padding the caller happens to apply.
library;

import 'package:flutter/material.dart';

import '../../core/qr_matrix.dart';

class QrCodeView extends StatelessWidget {
  const QrCodeView({
    super.key,
    required this.value,
    required this.size,
    this.color = const Color(0xFF2D2722),
    this.background = const Color(0xFFFFFDF9),
  });

  /// The string to encode. An empty value renders the placeholder instead.
  final String value;

  /// Rendered width and height in logical pixels.
  final double size;

  /// Module colour.
  final Color color;

  /// Background colour; also the quiet zone.
  final Color background;

  @override
  Widget build(BuildContext context) {
    final matrix = qrMatrix(value);

    if (matrix == null) {
      // An empty or unencodable value gets a blank tile rather than a broken
      // one, so a layout never jumps when the value finally arrives.
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.circular(8),
        ),
      );
    }

    return Semantics(
      image: true,
      label: 'QR code',
      child: SizedBox(
        width: size,
        height: size,
        child: CustomPaint(
          painter:
              _QrPainter(matrix: matrix, color: color, background: background),
        ),
      ),
    );
  }
}

class _QrPainter extends CustomPainter {
  const _QrPainter({
    required this.matrix,
    required this.color,
    required this.background,
  });

  final QrMatrixData matrix;
  final Color color;
  final Color background;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = background);
    // Four modules of quiet zone on every side, per the spec's minimum.
    const quiet = 4;
    final span = matrix.count + quiet * 2;
    final scale = size.width / span;

    final path = Path();
    for (var y = 0; y < matrix.count; y++) {
      final row = matrix.modules[y];
      for (var x = 0; x < matrix.count; x++) {
        if (!row[x]) continue;
        path.addRect(Rect.fromLTWH((x + quiet) * scale, (y + quiet) * scale,
            scale + 0.01, scale + 0.01));
      }
    }
    canvas.drawPath(path, Paint()..color = color);
  }

  @override
  bool shouldRepaint(covariant _QrPainter old) =>
      old.color != color ||
      old.background != background ||
      !identical(old.matrix, matrix);
}
