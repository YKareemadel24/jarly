import { describe, expect, it } from "vitest";

import { lockPolicy } from "../lib/lock-policy";

describe("lock policy", () => {
  it("keeps the app gated while lock settings are loading", () => {
    expect(
      lockPolicy({
        ready: false,
        biometricLockEnabled: false,
        biometricAvailable: false,
        pinLockEnabled: false,
        hasPin: false,
        native: true,
      }).required,
    ).toBe(true);
  });

  it("keeps an enabled biometric lock active when biometrics are unavailable", () => {
    expect(
      lockPolicy({
        ready: true,
        biometricLockEnabled: true,
        biometricAvailable: false,
        pinLockEnabled: false,
        hasPin: false,
        native: true,
      }),
    ).toMatchObject({ required: true, canBiometrics: false, canPin: false });
  });

  it("allows a configured PIN as fallback for an enabled biometric lock", () => {
    expect(
      lockPolicy({
        ready: true,
        biometricLockEnabled: true,
        biometricAvailable: false,
        pinLockEnabled: false,
        hasPin: true,
        native: true,
      }).canPin,
    ).toBe(true);
  });

  it("does not disable a PIN lock when its stored credential is missing", () => {
    expect(
      lockPolicy({
        ready: true,
        biometricLockEnabled: false,
        biometricAvailable: false,
        pinLockEnabled: true,
        hasPin: false,
        native: true,
      }).required,
    ).toBe(true);
  });
});
