/// Per-scheme jar accent resolution — the port of `hooks/use-jar-accents.ts`.
/// Dark-theme accents are brighter so alpha-tinted chips stay legible.
library;

import 'package:flutter/material.dart';

import '../hex_color.dart';
import '../../domain/domain.dart' show jarAccent, jarAccentDark;
import 'palette.dart';

Map<String, String> accentMapFor(Palette palette) =>
    identical(palette, Palette.dark) ||
        palette.background == Palette.dark.background
    ? jarAccentDark
    : jarAccent;

/// Resolve one accent name against the active scheme.
String accentFor(String name, Palette palette) =>
    accentMapFor(palette)[name] ?? jarAccent['ocean']!;

/// Convenience for building RN-style alpha-suffixed accent colors.
Color accentColor(String name, String alphaHex, Palette palette) =>
    hexAlpha(accentFor(name, palette), alphaHex);
