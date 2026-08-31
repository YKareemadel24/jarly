import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

const REMINDERS_KEY = "saving-jar:reminders";
const BIOMETRIC_KEY = "saving-jar:biometric-lock";
const PIN_LOCK_KEY = "saving-jar:pin-lock";
const SECURE_PIN_KEY = "saving-jar.app-lock.pin";
const CURRENCY_KEY = "saving-jar:currency";

export const SUPPORTED_CURRENCIES = [
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "EGP", name: "Egyptian Pound", symbol: "E£" },
  { code: "SAR", name: "Saudi Riyal", symbol: "SR" },
  { code: "AED", name: "UAE Dirham", symbol: "AED" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]["code"];

export const MIN_PIN_LENGTH = 4;

async function writePin(pin: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(SECURE_PIN_KEY, pin);
  } else {
    await SecureStore.setItemAsync(SECURE_PIN_KEY, pin);
  }
}

async function readPin(): Promise<string | null> {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(SECURE_PIN_KEY);
  }
  return SecureStore.getItemAsync(SECURE_PIN_KEY);
}

async function deletePin(): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(SECURE_PIN_KEY);
  } else {
    await SecureStore.deleteItemAsync(SECURE_PIN_KEY);
  }
}

type SettingsContextValue = {
  /** Whether gentle support (reminders) is enabled. */
  remindersEnabled: boolean;
  setRemindersEnabled: (next: boolean) => void;
  /** Whether a face / fingerprint scanner exists and has enrolled data (native only). */
  biometricAvailable: boolean;
  /** Whether biometric unlock gates the app. */
  biometricLockEnabled: boolean;
  setBiometricLockEnabled: (next: boolean) => void;
  /** Whether PIN lock is enabled. Requires a PIN to have been set. */
  pinLockEnabled: boolean;
  /** True once a PIN has been configured. */
  hasPin: boolean;
  /** Save or change the PIN used to unlock. Returns false on invalid input. */
  setPin: (pin: string) => Promise<boolean>;
  /** Verify a PIN attempt. */
  tryUnlock: (pin: string) => Promise<boolean>;
  /** Enable PIN lock; assumes `setPin` was called first. */
  enablePinLock: () => Promise<boolean>;
  /** Disable PIN lock and clear the stored PIN. */
  disablePinLock: () => Promise<void>;
  /** Prompt the platform biometric scanner. Resolves true on a successful match. */
  authenticateWithBiometrics: () => Promise<boolean>;
  /** Whether the store has finished reading persisted state. */
  ready: boolean;
  /** Active currency code (ISO 4217). */
  currency: CurrencyCode;
  setCurrency: (next: CurrencyCode) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [remindersEnabled, setRemindersEnabledState] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLockEnabled, setBiometricLockEnabledState] = useState(false);
  const [pinLockEnabled, setPinLockEnabledState] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [currency, setCurrencyState] = useState<CurrencyCode>("USD");

  // Detect whether the device offers usable biometrics (native only). Never
  // available on the web target, so the toggle simply stays hidden there.
  useEffect(() => {
    if (Platform.OS === "web") return;
    let cancelled = false;
    (async () => {
      try {
        const [hardware, enrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        if (!cancelled) setBiometricAvailable(hardware && enrolled);
      } catch {
        if (!cancelled) setBiometricAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Restore persisted settings on first mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [remindersRaw, biometricRaw, pinLockRaw, pin, currencyRaw] = await Promise.all([
          AsyncStorage.getItem(REMINDERS_KEY),
          AsyncStorage.getItem(BIOMETRIC_KEY),
          AsyncStorage.getItem(PIN_LOCK_KEY),
          readPin(),
          AsyncStorage.getItem(CURRENCY_KEY),
        ]);
        if (cancelled) return;
        const reminders = remindersRaw === "true";
        const biometricEnabled = biometricRaw === "true";
        const pinEnabled = pinLockRaw === "true";
        const configured = pin !== null;
        const validCodes = SUPPORTED_CURRENCIES.map((c) => c.code);
        const restoredCurrency: CurrencyCode = currencyRaw && validCodes.includes(currencyRaw as CurrencyCode) ? (currencyRaw as CurrencyCode) : "USD";
        setRemindersEnabledState(reminders);
        setBiometricLockEnabledState(biometricEnabled);
        // Only treat PIN lock as on when a PIN is actually configured, so the
        // gate can never appear asking for a PIN that doesn't exist yet.
        setPinLockEnabledState(pinEnabled && configured);
        setHasPin(configured);
        setCurrencyState(restoredCurrency);
      } catch {
        // Failed to read settings: keep defaults.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setRemindersEnabled = useCallback((next: boolean) => {
    setRemindersEnabledState(next);
    AsyncStorage.setItem(REMINDERS_KEY, String(next)).catch(() => undefined);
  }, []);

  const setBiometricLockEnabled = useCallback((next: boolean) => {
    setBiometricLockEnabledState(next);
    AsyncStorage.setItem(BIOMETRIC_KEY, String(next)).catch(() => undefined);
  }, []);

  const setPin = useCallback(async (pin: string) => {
    if (!/^\d{4,}$/.test(pin)) return false;
    try {
      await writePin(pin);
      setHasPin(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  const enablePinLock = useCallback(async () => {
    const pin = await readPin();
    if (pin === null) return false;
    setPinLockEnabledState(true);
    await AsyncStorage.setItem(PIN_LOCK_KEY, "true").catch(() => undefined);
    return true;
  }, []);

  const disablePinLock = useCallback(async () => {
    setPinLockEnabledState(false);
    await deletePin();
    setHasPin(false);
    await AsyncStorage.setItem(PIN_LOCK_KEY, "false").catch(() => undefined);
  }, []);

  const tryUnlock = useCallback(async (pin: string) => {
    const stored = await readPin();
    if (stored === null || stored !== pin) return false;
    return true;
  }, []);

  const setCurrency = useCallback((next: CurrencyCode) => {
    setCurrencyState(next);
    AsyncStorage.setItem(CURRENCY_KEY, next).catch(() => undefined);
  }, []);

  const authenticateWithBiometrics = useCallback(async () => {
    if (Platform.OS === "web") return false;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock your Saving Jar",
        cancelLabel: "Use PIN instead",
        fallbackLabel: "Use PIN instead",
      });
      return result.success;
    } catch {
      return false;
    }
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      remindersEnabled,
      setRemindersEnabled,
      biometricAvailable,
      biometricLockEnabled,
      setBiometricLockEnabled,
      pinLockEnabled,
      hasPin,
      setPin,
      tryUnlock,
      enablePinLock,
      disablePinLock,
      authenticateWithBiometrics,
      ready,
      currency,
      setCurrency,
    }),
    [remindersEnabled, setRemindersEnabled, biometricAvailable, biometricLockEnabled, setBiometricLockEnabled, pinLockEnabled, hasPin, setPin, tryUnlock, enablePinLock, disablePinLock, authenticateWithBiometrics, ready, currency, setCurrency],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
