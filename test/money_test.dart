/// Regression coverage for exact money conversion, display, and input.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:jarly/domain/domain.dart';

import 'helpers.dart';

void main() {
  group('money', () {
    test('converts dollars to integer minor units', () {
      expect(toMinor(25.5), 2550);
      expect(money(2550), contains('25.50'));
    });

    test('rejects non-finite input', () {
      expect(toMinor('abc'), isNull);
      expect(toMinor(double.nan), isNull);
    });

    test('rejects values outside safe minor-unit precision', () {
      expect(toMinor('90071992547409.92'), isNull);
    });

    test('preserves adjacent cents through the supported limit', () {
      for (var cents = 0; cents <= 91; cents++) {
        final text = '90071992547409.${cents.toString().padLeft(2, '0')}';
        expect(toMinor(text), 9007199254740900 + cents, reason: text);
      }
      expect(toMinor('90071992547409.92'), isNull);
      expect(toMinor('-90071992547409.91'), -9007199254740991);
      expect(toMinor('-90071992547409.92'), isNull);
    });

    test('formats exact decimal input without a floating-point round-trip', () {
      expect(minorToDecimal(9007199254740901), '90071992547409.01');
      expect(minorToDecimal(9007199254740991), '90071992547409.91');
      expect(minorToDecimal(-1), '-0.01');
      expect(minorToDecimal(0), '0.00');
    });

    test('displays adjacent cents exactly with locale separators', () {
      Intl.withLocale('en_US', () {
        expect(money(9007199254740901), r'$90,071,992,547,409.01');
        expect(money(9007199254740902), r'$90,071,992,547,409.02');
        expect(money(9007199254740991), r'$90,071,992,547,409.91');
        expect(money(-1), r'-$0.01');
        expect(money(0), r'$0.00');
        expect(money(105, 'EGP'), 'EGP\u00a01.05');
      });
      Intl.withLocale('de_DE', () {
        expect(money(9007199254740901), r'$90.071.992.547.409,01');
      });
    });

    test('retains numeric conversion used by legacy callers', () {
      expect(toMinor(25.5), 2550);
      expect(toMinor(1.125), 113);
      expect(toMinor(-1.125), -112);
      expect(toMinor(double.infinity), isNull);
    });
  });

  group('parseAmountInput', () {
    test('accepts exact grouped and comma-decimal amounts', () {
      const amounts = {
        '1,234.56': 123456,
        '1.234,56': 123456,
        '1234,56': 123456,
        ' .50 ': 50,
        '90071992547409.91': maxSafeInteger,
      };
      for (final entry in amounts.entries) {
        expect(parseAmountInput(entry.key), entry.value, reason: entry.key);
      }
    });

    test('rejects signed, ambiguous, and unsupported amount strings', () {
      for (final raw in [
        '-12',
        '+12',
        '1,234',
        '1.234',
        '12.3456',
        '1,23.45',
        r'$123.45',
        '1e2',
        '90071992547409.92',
      ]) {
        expect(parseAmountInput(raw), isNull, reason: raw);
      }
    });
  });

  group('Saving Jar progress helpers', () {
    test('calculates progress in minor units, including safe target and cap behavior', () {
      expect(percent(jar(balance: 2500)), 25);
      expect(percent(jar(balance: 15000)), 100);
      expect(percent(jar(balance: 0, target: 0)), 0);
    });

    test('formats money with cents preserved', () {
      expect(money(123440), contains('1,234.40'));
    });

    test('provides a visual accent for every selectable jar color', () {
      expect(jarAccent.keys.toList(), [
        'coral',
        'amber',
        'mint',
        'ocean',
        'berry',
        'clay',
      ]);
      expect(jarAccent['ocean'], startsWith('#'));
    });
  });
}
