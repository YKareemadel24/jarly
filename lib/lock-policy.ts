export function lockPolicy(input: {
  ready: boolean;
  biometricLockEnabled: boolean;
  biometricAvailable: boolean;
  pinLockEnabled: boolean;
  hasPin: boolean;
  native: boolean;
}) {
  return {
    required:
      !input.ready || input.biometricLockEnabled || input.pinLockEnabled,
    canBiometrics:
      input.ready &&
      input.biometricLockEnabled &&
      input.biometricAvailable &&
      input.native,
    canPin:
      input.ready &&
      input.hasPin &&
      (input.pinLockEnabled || input.biometricLockEnabled),
  };
}
