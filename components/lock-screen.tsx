import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { type ThemeColorPalette } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import { useSettings } from "@/lib/settings-store";

const PIN_LENGTH = 4;

function PinDots({ length, styles, colors }: { length: number; styles: ReturnType<typeof makeStyles>; colors: ThemeColorPalette }) {
  return (
    <View style={styles.dots}>
      {Array.from({ length: PIN_LENGTH }).map((_, index) => (
        <View key={index} style={[styles.dot, index < length && { backgroundColor: colors.foreground }]} />
      ))}
    </View>
  );
}

/**
 * Full-screen gate that unlocks the app via biometric prompt or PIN, whichever
 * the user has enabled. Renders nothing when no lock is configured.
 */
export function LockScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { biometricLockEnabled, biometricAvailable, authenticateWithBiometrics, pinLockEnabled, hasPin, tryUnlock, disablePinLock } = useSettings();
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [pinShown, setPinShown] = useState(false);

  const canBio = biometricLockEnabled && biometricAvailable && Platform.OS !== "web";
  const canPin = pinLockEnabled && hasPin;
  const anyLock = canBio || canPin;

  const promptBio = useCallback(() => {
    if (!canBio || unlocking) return;
    setUnlocking(true);
    setBioError(null);
    authenticateWithBiometrics()
      .then((ok) => {
        if (ok) {
          setShown(false);
          setPinShown(false);
        } else {
          setBioError("We couldn't verify it. Try again.");
        }
      })
      .catch(() => setBioError("Biometrics are unavailable right now."))
      .finally(() => setUnlocking(false));
  }, [canBio, unlocking, authenticateWithBiometrics]);

  const submitPin = useCallback(
    (candidate: string) => {
      if (candidate.length !== PIN_LENGTH || unlocking) return;
      setUnlocking(true);
      tryUnlock(candidate)
        .then((ok) => {
          if (ok) {
            setShown(false);
            setPinShown(false);
            setPin("");
            setPinError(false);
          } else {
            setPinError(true);
            setPin("");
          }
        })
        .catch(() => {
          setPinError(true);
          setPin("");
        })
        .finally(() => setUnlocking(false));
    },
    [tryUnlock, unlocking],
  );

  useEffect(() => {
    if (pin.length === PIN_LENGTH) submitPin(pin);
  }, [pin, submitPin]);

  useEffect(() => {
    if (!anyLock) {
      setShown(false);
      setPinShown(false);
      return;
    }
    setShown(true);
    // Bio takes priority on the auto-prompt; PIN is a manual fallback the user
    // can tap into if their device can't authenticate.
    if (canBio) {
      setPinShown(false);
    } else if (canPin) {
      setPinShown(true);
    }
  }, [anyLock, canBio, canPin]);

  useEffect(() => {
    if (shown && canBio) promptBio();
  }, [shown, canBio, promptBio]);

  // Re-lock whenever the app returns to the foreground.
  useEffect(() => {
    if (!anyLock) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setShown(true);
    });
    return () => sub.remove();
  }, [anyLock]);

  if (!shown) return null;

  const handleKey = (digit: string) => {
    if (unlocking || pin.length >= PIN_LENGTH) return;
    setPin((current) => current + digit);
    setPinError(false);
  };
  const erase = () => {
    setPin((current) => current.slice(0, -1));
    setPinError(false);
  };

  const showPinPanel = pinShown || (canPin && !canBio);
  const keypad = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"] as const;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.inner}>
        {showPinPanel ? (
          <>
            <View style={styles.mark}><MaterialIcons name="lock" size={30} color={colors.primary} /></View>
            <Text style={styles.title}>Your Saving Jar is locked</Text>
            <Text style={styles.subtitle}>Enter your PIN to keep saving.</Text>
            {pinError ? <Text style={styles.error}>That PIN didn&apos;t match. Try again.</Text> : null}
            <PinDots length={pin.length} styles={styles} colors={colors} />
            {canBio ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Use fingerprint or face instead" onPress={() => { setPin(""); setPinError(false); setPinShown(false); promptBio(); }} style={({ pressed }) => [styles.bioButton, pressed && styles.pressed]}>
                <MaterialIcons name="fingerprint" size={20} color={colors.primary} />
                <Text style={styles.bioButtonText}>Use fingerprint or face</Text>
              </Pressable>
            ) : null}
            <View style={styles.keypad}>
              {keypad.map((key, index) => {
                if (key === "") return <View key={index} style={styles.keySlot} />;
                return (
                  <Pressable key={index} accessibilityLabel={key === "back" ? "Delete" : `Digit ${key}`} onPress={key === "back" ? erase : () => handleKey(key)} style={({ pressed }) => [styles.key, pressed && styles.pressed]}>
                    {key === "back" ? <MaterialIcons name="backspace" size={22} color={colors.muted} /> : <Text style={styles.keyText}>{key}</Text>}
                  </Pressable>
                );
              })}
            </View>
            {unlocking ? <ActivityIndicator color={colors.primary} style={styles.spinner} /> : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Forgot PIN, turn off lock" onPress={() => { void disablePinLock(); setShown(false); setPinShown(false); }} hitSlop={8} style={styles.forgot}>
              <Text style={styles.forgotText}>Forgot PIN? Turn off lock</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.mark}><MaterialIcons name="fingerprint" size={32} color={colors.primary} /></View>
            <Text style={styles.title}>Your Saving Jar is locked</Text>
            <Text style={styles.subtitle}>Use your fingerprint or face to keep saving.</Text>
            {bioError ? <Text style={styles.error}>{bioError}</Text> : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Try again" onPress={promptBio} disabled={unlocking} style={({ pressed }) => [styles.bioButton, pressed && styles.pressed]}>
              {unlocking ? <ActivityIndicator color={colors.primary} /> : <MaterialIcons name="fingerprint" size={20} color={colors.primary} />}
              <Text style={styles.bioButtonText}>{unlocking ? "Checking…" : "Try again"}</Text>
            </Pressable>
            {canPin ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Use PIN instead" onPress={() => setPinShown(true)} style={styles.forgot}>
                <Text style={styles.forgotText}>Use PIN instead</Text>
              </Pressable>
            ) : (
              <Text style={styles.hint}>Unlock happens automatically when the device recognizes you.</Text>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (c: ThemeColorPalette) =>
  StyleSheet.create({
    safe: { ...StyleSheet.absoluteFillObject, backgroundColor: c.background, zIndex: 100 },
    inner: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
    mark: { width: 72, height: 72, borderRadius: 26, backgroundColor: `${c.primary}18`, alignItems: "center", justifyContent: "center" },
    title: { color: c.foreground, fontFamily: "Georgia", fontSize: 24, marginTop: 18, textAlign: "center" },
    subtitle: { color: c.muted, fontSize: 13, marginTop: 7, textAlign: "center" },
    error: { color: c.error, fontSize: 12, fontWeight: "700", marginTop: 16, textAlign: "center" },
    dots: { flexDirection: "row", gap: 14, marginTop: 26 },
    dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: c.border },
    bioButton: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 22, minHeight: 48, paddingHorizontal: 18, borderRadius: 15, backgroundColor: `${c.primary}14`, borderWidth: 1, borderColor: `${c.primary}44` },
    bioButtonText: { color: c.primary, fontSize: 13, fontWeight: "800" },
    keypad: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", width: 264, marginTop: 28, gap: 12 },
    keySlot: { width: 78, height: 66 },
    key: { width: 78, height: 66, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
    keyText: { color: c.foreground, fontSize: 24, fontWeight: "700" },
    spinner: { marginTop: 22 },
    forgot: { marginTop: 22, paddingVertical: 6 },
    forgotText: { color: c.muted, fontSize: 12, fontWeight: "700", textDecorationLine: "underline" },
    hint: { color: c.muted, fontSize: 11, marginTop: 22, textAlign: "center", maxWidth: 240 },
    pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  });
