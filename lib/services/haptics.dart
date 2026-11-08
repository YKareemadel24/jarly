/// Tiered haptic feedback, ported from `lib/haptics.ts`. No-ops where the
/// platform cannot vibrate (web).
library;

import 'package:flutter/services.dart';

class Haptics {
  const Haptics._();

  static void tap() => HapticFeedback.selectionClick();
  static void medium() => HapticFeedback.mediumImpact();
  static void success() => HapticFeedback.mediumImpact();
  static void error() => HapticFeedback.heavyImpact();
  static void milestone() => HapticFeedback.heavyImpact();
}
