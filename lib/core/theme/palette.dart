/// Theme palette ported verbatim from `theme.config.js` — each token as a
/// light/dark pair. Warm paper in light, warm charcoal in dark; jar accents
/// stay recognizable in both.
library;

import 'package:flutter/material.dart';

class Palette {
  const Palette({
    required this.primary,
    required this.background,
    required this.surface,
    required this.foreground,
    required this.muted,
    required this.border,
    required this.success,
    required this.warning,
    required this.error,
  });

  final Color primary;
  final Color background;
  final Color surface;
  final Color foreground;
  final Color muted;
  final Color border;
  final Color success;
  final Color warning;
  final Color error;

  static const Palette light = Palette(
    primary: Color(0xFF3B2D24),
    background: Color(0xFFF6F1E8),
    surface: Color(0xFFFFFDF9),
    foreground: Color(0xFF2C231D),
    muted: Color(0xFF6B5F55),
    border: Color(0xFFE6DCD0),
    success: Color(0xFF4A9579),
    warning: Color(0xFFB88322),
    error: Color(0xFFB5534D),
  );

  static const Palette dark = Palette(
    primary: Color(0xFF9C6C53),
    background: Color(0xFF201B18),
    surface: Color(0xFF2D2722),
    foreground: Color(0xFFF6EDE2),
    muted: Color(0xFFC5B7AA),
    border: Color(0xFF4A4039),
    success: Color(0xFF7BC6A7),
    warning: Color(0xFFE4BD61),
    error: Color(0xFFE98C85),
  );

  static Palette of(Brightness brightness) =>
      brightness == Brightness.dark ? dark : light;
}
