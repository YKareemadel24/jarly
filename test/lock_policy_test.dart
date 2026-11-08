import 'package:flutter_test/flutter_test.dart';
import 'package:jarly/lock/lock_policy.dart';

void main() {
  group('lock policy', () {
    test('keeps the app gated while lock settings are loading', () {
      expect(
        lockPolicy(
          const LockPolicyInput(
            ready: false,
            biometricLockEnabled: false,
            biometricAvailable: false,
            pinLockEnabled: false,
            hasPin: false,
            native: true,
          ),
        ).required,
        isTrue,
      );
    });

    test(
      'keeps an enabled biometric lock active when biometrics are unavailable',
      () {
        final policy = lockPolicy(
          const LockPolicyInput(
            ready: true,
            biometricLockEnabled: true,
            biometricAvailable: false,
            pinLockEnabled: false,
            hasPin: false,
            native: true,
          ),
        );
        expect(policy.required, isTrue);
        expect(policy.canBiometrics, isFalse);
        expect(policy.canPin, isFalse);
      },
    );

    test(
      'allows a configured PIN as fallback for an enabled biometric lock',
      () {
        expect(
          lockPolicy(
            const LockPolicyInput(
              ready: true,
              biometricLockEnabled: true,
              biometricAvailable: false,
              pinLockEnabled: false,
              hasPin: true,
              native: true,
            ),
          ).canPin,
          isTrue,
        );
      },
    );

    test(
      'does not disable a PIN lock when its stored credential is missing',
      () {
        expect(
          lockPolicy(
            const LockPolicyInput(
              ready: true,
              biometricLockEnabled: false,
              biometricAvailable: false,
              pinLockEnabled: true,
              hasPin: false,
              native: true,
            ),
          ).required,
          isTrue,
        );
      },
    );
  });
}
