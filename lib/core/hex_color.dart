/// Color helpers matching the original app's hex-string palette usage.
///
/// The RN codebase built colors as `#RRGGBB` plus a two-digit alpha *suffix*
/// (`${accent}A8`), which React Native reads as #RRGGBBAA. Flutter wants
/// 0xAARRGGBB, so these helpers keep ported call sites compact and correct.
library;

import 'package:flutter/material.dart';

int _hexToInt(String hex) => int.parse(hex, radix: 16);

/// Parse `#RRGGBB` (or `#RRGGBBAA`).
Color parseHex(String hex) {
  var value = hex.replaceFirst('#', '');
  if (value.length == 6) value = 'FF$value';
  if (value.length == 8) {
    // RN order is RRGGBBAA; Flutter wants AARRGGBB.
    final rgb = value.substring(0, 6);
    final alpha = value.substring(6, 8);
    return Color(_hexToInt('$alpha$rgb'));
  }
  return const Color(0xFF000000);
}

/// `#RRGGBB` with an RN-style alpha suffix appended, e.g. hexAlpha('#D97963', 'A8').
Color hexAlpha(String hex, String alphaHex) =>
    Color((_hexToInt(alphaHex) << 24) | _hexToInt(hex.replaceFirst('#', '')));

/// Fully opaque hex color.
Color hexColor(String hex) => parseHex(hex);

/// CSS-style rgba() used in a few ported styles.
Color cssRgba(int r, int g, int b, double a) =>
    Color.fromARGB((a * 255).round(), r, g, b);

/// Render a [Color] back as `#RRGGBB` for the RN-style alpha-suffix helpers.
String toRrggbb(Color color) => (color.toARGB32() & 0xFFFFFF)
    .toRadixString(16)
    .padLeft(6, '0')
    .toUpperCase();
