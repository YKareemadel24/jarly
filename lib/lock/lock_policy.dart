/// Which unlock paths the app gate offers, derived from settings and platform.
library;

class LockPolicyInput {
  const LockPolicyInput({
    required this.ready,
    required this.biometricLockEnabled,
    required this.biometricAvailable,
    required this.pinLockEnabled,
    required this.hasPin,
    required this.native,
  });
  final bool ready;
  final bool biometricLockEnabled;
  final bool biometricAvailable;
  final bool pinLockEnabled;
  final bool hasPin;
  final bool native;
}

class LockPolicy {
  const LockPolicy({required this.required, required this.canBiometrics, required this.canPin});
  final bool required;
  final bool canBiometrics;
  final bool canPin;
}

LockPolicy lockPolicy(LockPolicyInput input) {
  return LockPolicy(
    required: !input.ready || input.biometricLockEnabled || input.pinLockEnabled,
    canBiometrics:
        input.ready && input.biometricLockEnabled && input.biometricAvailable && input.native,
    canPin: input.ready && input.hasPin && (input.pinLockEnabled || input.biometricLockEnabled),
  );
}
