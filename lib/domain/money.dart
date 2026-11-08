/// Money primitives for the Saving Jar domain.
///
/// Money is ALWAYS an integer number of minor units (cents). Never floats.
/// These are the only places conversion happens, so a display value can
/// never leak into a stored one.
library;

import 'package:intl/intl.dart';

/// Largest integer exactly representable as a JSON number (2^53 - 1).
const int maxSafeInteger = 9007199254740991;

/// TS `Math.round`: rounds half toward positive infinity, unlike Dart's
/// `round()` which rounds half away from zero.
int mathRound(num value) {
  final floor = value.floorToDouble();
  return (value - floor) >= 0.5 ? floor.toInt() + 1 : floor.toInt();
}

/// True when [value] is an integer within the JSON-safe range.
bool isSafeInteger(num value) =>
    value is int && value >= -maxSafeInteger && value <= maxSafeInteger;

/// Convert a human-entered value into minor units. Null when not a finite number.
int? toMinor(Object? value) {
  final double? n = switch (value) {
    int() => value.toDouble(),
    double() => value,
    String() => double.tryParse(value),
    _ => null,
  };
  if (n == null || n.isNaN || n.isInfinite) return null;
  final minor = mathRound(n * 100);
  return isSafeInteger(minor) ? minor : null;
}

/// Convert minor units back to a whole-currency number for display inputs.
double fromMinor(int minor) => minor / 100;

/// Format minor units as a currency string, falling back when Intl lacks the currency.
String money(int minor, [String currency = 'USD']) {
  try {
    final format = NumberFormat.currency(
      locale: Intl.getCurrentLocale(),
      name: currency,
      customPattern: '\u00A4#,##0.00',
    );
    return format.format(fromMinor(minor));
  } catch (_) {
    return '$currency ${fromMinor(minor).toStringAsFixed(2)}';
  }
}

/// Keep only digits and a single decimal separator, max two fraction digits.
/// A comma is accepted as a decimal separator and normalised to a period.
String sanitizeAmountInput(String raw) {
  final cleaned = StringBuffer();
  var seenDot = false;
  var fraction = 0;
  for (final char in raw.replaceAll(',', '.').runes) {
    final ch = String.fromCharCode(char);
    if (ch.codeUnitAt(0) >= 0x30 && ch.codeUnitAt(0) <= 0x39) {
      if (seenDot) {
        if (fraction >= 2) continue;
        fraction += 1;
      }
      cleaned.write(ch);
    } else if (ch == '.' && !seenDot) {
      seenDot = true;
      cleaned.write(ch);
    }
  }
  return cleaned.toString();
}
