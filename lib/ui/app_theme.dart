/// MaterialApp themes built from the exact token palette.
library;

import 'package:flutter/material.dart';

import '../core/theme/palette.dart';

ThemeData buildAppTheme(Palette p, Brightness brightness) {
  final isDark = brightness == Brightness.dark;
  final scheme = ColorScheme(
    brightness: brightness,
    primary: p.primary,
    onPrimary: p.background,
    secondary: p.primary,
    onSecondary: p.background,
    surface: p.surface,
    onSurface: p.foreground,
    error: p.error,
    onError: p.background,
    outline: p.border,
    surfaceContainerHighest: p.surface,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: p.background,
    splashFactory: InkSparkle.splashFactory,
    fontFamily: 'Georgia',
    fontFamilyFallback: const ['serif'],
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((states) =>
          states.contains(WidgetState.selected) ? p.background : p.muted),
      trackColor: WidgetStateProperty.resolveWith((states) =>
          states.contains(WidgetState.selected) ? p.success : p.border),
      trackOutlineColor: WidgetStateProperty.all(Color(0x00000000)),
    ),
    textTheme: TextTheme(
      bodyMedium: TextStyle(color: p.foreground, fontSize: 14, fontFamily: null),
      bodySmall: TextStyle(color: p.muted, fontSize: 12, fontFamily: null),
      titleLarge: TextStyle(color: p.foreground, fontSize: 20),
    ),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(
        color: isDark ? p.surface : p.foreground,
        borderRadius: BorderRadius.circular(8),
      ),
      textStyle: TextStyle(
        color: isDark ? p.foreground : p.background,
        fontSize: 12,
      ),
    ),
  );
}
