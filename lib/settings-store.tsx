import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

const REMINDERS_KEY = "saving-jar:reminders";
const BIOMETRIC_KEY = "saving-jar:biometric-lock";
const PIN_LOCK_KEY = "saving-jar:pin-lock";
const SECURE_PIN_KEY = "saving-jar.app-lock.pin";
const PIN_ATTEMPTS_KEY = "saving-jar:pin-attempts";
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
export const MAX_PIN_LENGTH = 12;

/** Consecutive failures tolerated before the lock starts imposing delays. */
const PIN_FREE_ATTEMPTS = 5;
/** Escalating lockout durations once the free attempts are exhausted. */
const PIN_LOCKOUT_SCHEDULE_MS = [30_000, 60_000, 5 * 60_000, 15 * 60_000];

/**
 * Stored PIN record: `v1:<length>:<saltHex>:<sha256(salt:pin)>`.
 *
 * The PIN is never stored in plaintext. It is a device-local convenience lock
 * rather than a credential, so a salted SHA-256 (not an online password hash)
 * is the proportionate primitive; the attempt throttle below is what actually
 * blunts guessing. Records written before hashing was introduced are bare
 * plaintext PINs: they still verify, and are upgraded on the next success.
 */
async function hashPin(pin: string, saltHex: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${saltHex}:${pin}`);
}

async function makePinRecord(pin: string): Promise<string> {
  const salt = Array.from(await Crypto.getRandomBytesAsync(16), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const hash = await hashPin(pin, salt);
  return `v1:${pin.length}:${salt}:${hash}`;
}

async function verifyPinRecord(record: string, pin: string): Promise<boolean> {
  if (!record.startsWith("v1:")) return record === pin; // legacy plaintext
  const [, , salt, hash] = record.split(":");
  if (!salt || !hash) return false;
  return (await hashPin(pin, salt)) === hash;
}

/** Number of digits in the stored PIN, or null when there is none. */
function pinLengthOf(record: string | null): number | null {
  if (!record) return null;
  if (record.startsWith("v1:")) {
    const length = Number(record.split(":")[1]);
    return Number.isInteger(length) && length > 0 ? length : null;
  }
  return record.length; // legacy plaintext record
}

async function writePinRecord(record: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(SECURE_PIN_KEY, record);
  } else {
    await SecureStore.setItemAsync(SECURE_PIN_KEY, record);
  }
}

async function readPinRecord(): Promise<string | null> {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(SECURE_PIN_KEY);
  }
  return SecureStore.getItemAsync(SECURE_PIN_KEY);
}

async function deletePinRecord(): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(SECURE_PIN_KEY);
  } else {
    await SecureStore.deleteItemAsync(SECURE_PIN_KEY);
  }
}

type PinAttemptState = { failures: number; lockedUntil: number };

async function readAttempts(): Promise<PinAttemptState> {
  try {
    const raw = await AsyncStorage.getItem(PIN_ATTEMPTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as PinAttemptState).failures === "number" &&
      typeof (parsed as PinAttemptState).lockedUntil === "number"
    ) {
      return parsed as PinAttemptState;
    }
  } catch {
    // A corrupt record just means the throttle starts over.
  }
  return { failures: 0, lockedUntil: 0 };
}

async function writeAttempts(state: PinAttemptState): Promise<void> {
  await AsyncStorage.setItem(PIN_ATTEMPTS_KEY, JSON.stringify(state)).catch(() => undefined);
}

/** Lockout duration for a given consecutive-failure count (0 = no lockout). */
function lockoutMsFor(failures: number): number {
  if (failures < PIN_FREE_ATTEMPTS) return 0;
  return PIN_LOCKOUT_SCHEDULE_MS[Math.min(failures - PIN_FREE_ATTEMPTS, PIN_LOCKOUT_SCHEDULE_MS.length - 1)];
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
  /** Number of digits in the configured PIN, or null when there is none. */
  pinLength: number | null;
  /** Epoch ms until which PIN attempts are throttled, or null when not throttled. */
  pinLockedUntil: number | null;
  /** Save or change the PIN used to unlock. Returns false on invalid input. */
  setPin: (pin: string) => Promise<boolean>;
  /**
   * Verify a PIN attempt. "locked" means too many recent failures — the caller
   * should back off (see `pinLockedUntil`) rather than prompt again at once.
   */
  tryUnlock: (pin: string) => Promise<"ok" | "wrong" | "locked">;
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
  const [pinLength, setPinLengthState] = useState<number | null>(null);
  const [pinLockedUntil, setPinLockedUntil] = useState<number | null>(null);
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
        const [remindersRaw, biometricRaw, pinLockRaw, pinRecord, attempts, currencyRaw] = await Promise.all([
          AsyncStorage.getItem(REMINDERS_KEY),
          AsyncStorage.getItem(BIOMETRIC_KEY),
          AsyncStorage.getItem(PIN_LOCK_KEY),
          readPinRecord(),
          readAttempts(),
          AsyncStorage.getItem(CURRENCY_KEY),
        ]);
        if (cancelled) return;
        const reminders = remindersRaw === "true";
        const biometricEnabled = biometricRaw === "true";
        const pinEnabled = pinLockRaw === "true";
        const configured = pinRecord !== null;
        const validCodes = SUPPORTED_CURRENCIES.map((c) => c.code);
        const restoredCurrency: CurrencyCode = currencyRaw && validCodes.includes(currencyRaw as CurrencyCode) ? (currencyRaw as CurrencyCode) : "USD";
        setRemindersEnabledState(reminders);
        setBiometricLockEnabledState(biometricEnabled);
        // Only treat PIN lock as on when a PIN is actually configured, so the
        // gate can never appear asking for a PIN that doesn't exist yet.
        setPinLockEnabledState(pinEnabled && configured);
        setHasPin(configured);
        setPinLengthState(pinLengthOf(pinRecord));
        setPinLockedUntil(attempts.lockedUntil > Date.now() ? attempts.lockedUntil : null);
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
    if (!/^\d{4,12}$/.test(pin)) return false;
    try {
      await writePinRecord(await makePinRecord(pin));
      setHasPin(true);
      setPinLengthState(pin.length);
      return true;
    } catch {
      return false;
    }
  }, []);

  const enablePinLock = useCallback(async () => {
    const pin = await readPinRecord();
    if (pin === null) return false;
    setPinLockEnabledState(true);
    await AsyncStorage.setItem(PIN_LOCK_KEY, "true").catch(() => undefined);
    return true;
  }, []);

  const disablePinLock = useCallback(async () => {
    setPinLockEnabledState(false);
    await deletePinRecord();
    setHasPin(false);
    setPinLengthState(null);
    await AsyncStorage.removeItem(PIN_ATTEMPTS_KEY).catch(() => undefined);
    setPinLockedUntil(null);
    await AsyncStorage.setItem(PIN_LOCK_KEY, "false").catch(() => undefined);
  }, []);

  const tryUnlock = useCallback(async (pin: string): Promise<"ok" | "wrong" | "locked"> => {
    const now = Date.now();
    const attempts = await readAttempts();
    if (attempts.lockedUntil > now) {
      setPinLockedUntil(attempts.lockedUntil);
      return "locked";
    }

    const record = await readPinRecord();
    if (record === null) return "wrong";

    if (!(await verifyPinRecord(record, pin))) {
      // Escalating backoff: a handful of honest mistakes costs nothing, but
      // guessing is slowed to a crawl long before a 4-digit space is exhaustible.
      const failures = attempts.failures + 1;
      const lockMs = lockoutMsFor(failures);
      const lockedUntil = lockMs > 0 ? now + lockMs : 0;
      await writeAttempts({ failures, lockedUntil });
      setPinLockedUntil(lockedUntil > now ? lockedUntil : null);
      return lockedUntil > now ? "locked" : "wrong";
    }

    // Success: reset the throttle, and upgrade a legacy plaintext record to the
    // hashed format so the PIN no longer sits readable in storage.
    if (!record.startsWith("v1:")) {
      await writePinRecord(await makePinRecord(pin)).catch(() => undefined);
    }
    await AsyncStorage.removeItem(PIN_ATTEMPTS_KEY).catch(() => undefined);
    setPinLockedUntil(null);
    return "ok";
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
      pinLength,
      pinLockedUntil,
      setPin,
      tryUnlock,
      enablePinLock,
      disablePinLock,
      authenticateWithBiometrics,
      ready,
      currency,
      setCurrency,
    }),
    [remindersEnabled, setRemindersEnabled, biometricAvailable, biometricLockEnabled, setBiometricLockEnabled, pinLockEnabled, hasPin, pinLength, pinLockedUntil, setPin, tryUnlock, enablePinLock, disablePinLock, authenticateWithBiometrics, ready, currency, setCurrency],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
