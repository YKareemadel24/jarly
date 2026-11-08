import 'package:flutter_test/flutter_test.dart';
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
  });

  group('sanitizeAmountInput', () {
    test('strips non-numeric characters and extra separators', () {
      expect(sanitizeAmountInput('-12a3.4.5.6'), '123.45');
      expect(sanitizeAmountInput('abc'), '');
      expect(sanitizeAmountInput('1,2'), '1.2');
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
      expect(jarAccent.keys.toList(),
          ['coral', 'amber', 'mint', 'ocean', 'berry', 'clay']);
      expect(jarAccent['ocean'], startsWith('#'));
    });
  });
}
