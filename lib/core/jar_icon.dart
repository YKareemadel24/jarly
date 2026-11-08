/// How a jar's `icon` value should be drawn.
///
/// Jars store a bundled Material icon name ("flight") or any other short
/// string the user chose. Printable-ASCII values map to Material glyphs;
/// anything else (emoji, arbitrary text) renders as text.
library;

import 'package:flutter/material.dart';

/// Shown when a jar has no usable icon at all.
const String fallbackJarIcon = '🫙';

/// Material icon names are printable ASCII; emoji never are.
final RegExp _glyphName = RegExp(r'^[\x20-\x7E]+$');

/// Glyph-name lookups for the icons the app offers and the legacy names older
/// installs may carry.
const Map<String, IconData> jarIconGlyphs = {
  'flag': Icons.flag,
  'star': Icons.star,
  'flight': Icons.flight,
  'home': Icons.home,
  'favorite': Icons.favorite,
  'heart': Icons.favorite,
  'shopping_bag': Icons.shopping_bag,
  'cart': Icons.shopping_cart,
  'car': Icons.directions_car,
  'school': Icons.school,
  'savings': Icons.savings,
  'payments': Icons.payments,
  'gift': Icons.card_giftcard,
  'pets': Icons.pets,
  'music_note': Icons.music_note,
  'camera_alt': Icons.camera_alt,
  'fitness': Icons.fitness_center,
  'park': Icons.park,
  'wallet': Icons.wallet,
  'travel_explore': Icons.travel_explore,
  'rocket_launch': Icons.rocket_launch,
  'workspace_premium': Icons.workspace_premium,
  'medical_services': Icons.medical_services,
  'event': Icons.event,
};

sealed class JarIconRender {
  const JarIconRender();
}

class JarIconFont extends JarIconRender {
  const JarIconFont(this.icon);
  final IconData icon;
}

class JarIconText extends JarIconRender {
  const JarIconText(this.text);
  final String text;
}

JarIconRender jarIconRender(String icon) {
  final trimmed = icon.trim();
  if (trimmed.isNotEmpty && _glyphName.hasMatch(trimmed)) {
    return JarIconFont(jarIconGlyphs[trimmed] ?? Icons.flag);
  }
  return JarIconText(trimmed.isEmpty ? fallbackJarIcon : trimmed);
}
