import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { type ThemeColorPalette } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import { MIN_PIN_LENGTH, SUPPORTED_CURRENCIES, useSettings } from "@/lib/settings-store";
import { useThemeContext } from "@/lib/theme-provider";

function Preference({ icon, title, detail, value, onChange, disabled, styles, colors }: { icon: string; title: string; detail: string; value: boolean; onChange: (next: boolean) => void; disabled?: boolean; styles: ReturnType<typeof makeStyles>; colors: ThemeColorPalette }) {
  return <View style={styles.preference}><View style={styles.prefIcon}><MaterialIcons name={icon as never} size={19} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.prefTitle}>{title}</Text><Text style={styles.prefDetail}>{detail}</Text></View><Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ false: colors.border, true: `${colors.primary}8C` }} thumbColor={value ? colors.primary : "#FFFDF9"} /></View>;
}

type PinPromptMode = "setup" | "change";

export default function ProfileScreen() {
  const colors = useColors(); const styles = useMemo(() => makeStyles(colors), [colors]); const { appearanceMode, setAppearanceMode } = useThemeContext();
  const { remindersEnabled, setRemindersEnabled, biometricAvailable, biometricLockEnabled, setBiometricLockEnabled, pinLockEnabled, hasPin, setPin, enablePinLock, disablePinLock, currency, setCurrency } = useSettings();
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [pinMode, setPinMode] = useState<PinPromptMode | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const activeCurrency = SUPPORTED_CURRENCIES.find((c) => c.code === currency) ?? SUPPORTED_CURRENCIES[0];

  const openPinPrompt = (mode: PinPromptMode) => { setPinInput(""); setPinError(null); setPinMode(mode); };
  const closePinPrompt = () => { setPinMode(null); setPinInput(""); setPinError(null); };

  const submitPin = async () => {
    if (pinInput.length < MIN_PIN_LENGTH) { setPinError(`Use ${MIN_PIN_LENGTH} or more digits.`); return; }
    const ok = await setPin(pinInput);
    if (!ok) { setPinError("Could not save that PIN. Try again."); return; }
    if (pinMode === "setup") await enablePinLock();
    closePinPrompt();
  };

  const onPinLockChange = (next: boolean) => {
    if (next) {
      if (hasPin) { void enablePinLock(); }
      else { openPinPrompt("setup"); }
    } else {
      void disablePinLock();
    }
  };

  return (
    <ScreenContainer className="p-5">
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>PROFILE</Text>
        <Text style={styles.title}>Make it feel{"\n"}like yours.</Text>

        <View style={styles.identity}>
          <View style={styles.monogram}><Text style={styles.monogramText}>SJ</Text></View>
          <View><Text style={styles.identityTitle}>Your Saving Jar</Text><Text style={styles.identityCopy}>A private progress tracker</Text></View>
        </View>

        <Text style={styles.sectionLabel}>APPEARANCE</Text>
        <View style={styles.group}>
          <Text style={styles.groupTitle}>Theme</Text>
          <Text style={styles.groupCopy}>Choose the view that feels most comfortable.</Text>
          <View style={styles.themes}>
            {(["light", "dark", "system"] as const).map((mode) => (
              <Pressable key={mode} onPress={() => setAppearanceMode(mode)} style={({ pressed }) => [styles.themeChoice, appearanceMode === mode && styles.themeChoiceActive, pressed && styles.pressed]}>
                <MaterialIcons name={(mode === "light" ? "light-mode" : mode === "dark" ? "dark-mode" : "brightness-auto") as never} size={17} color={appearanceMode === mode ? "#FFFDF9" : colors.muted} />
                <Text style={[styles.themeText, appearanceMode === mode && styles.themeTextActive]}>{mode === "system" ? "Auto" : mode[0].toUpperCase() + mode.slice(1)}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={styles.sectionLabel}>GENTLE SUPPORT</Text>
        <View style={styles.group}>
          <Preference icon="notifications-none" title="Saving reminders" detail="Nudges for due deposits and deadlines" value={remindersEnabled} onChange={setRemindersEnabled} styles={styles} colors={colors} />
          <View style={styles.line} />
          <Preference
            icon="fingerprint"
            title="Fingerprint unlock"
            detail={biometricAvailable ? "Require your fingerprint or face to open your jar" : "Set up fingerprint or face unlock on this device to use this"}
            value={biometricLockEnabled && biometricAvailable}
            onChange={setBiometricLockEnabled}
            disabled={!biometricAvailable}
            styles={styles}
            colors={colors}
          />
          <View style={styles.line} />
          <Preference icon="lock-outline" title="PIN lock" detail="Use a 4-digit code if you'd rather not use biometrics" value={pinLockEnabled} onChange={onPinLockChange} styles={styles} colors={colors} />
          <View style={styles.line} />
          <Pressable disabled={!pinLockEnabled} style={({ pressed }) => [styles.prefAction, !pinLockEnabled && styles.prefActionDisabled, pressed && pinLockEnabled && styles.pressed]} onPress={() => pinLockEnabled ? (hasPin ? openPinPrompt("change") : openPinPrompt("setup")) : undefined}>
            <View style={styles.prefIcon}><MaterialIcons name="key" size={19} color={colors.primary} /></View>
            <View style={{ flex: 1 }}><Text style={styles.prefTitle}>{(hasPin ? "Change" : "Set") + " " + "PIN"}</Text><Text style={styles.prefDetail}>{!pinLockEnabled ? "Turn on PIN lock first." : hasPin ? "Update the code that unlocks your jar." : "Choose a code so only you can open it."}</Text></View>
            {pinLockEnabled ? <MaterialIcons name="chevron-right" size={20} color={colors.muted} /> : null}
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>PREFERENCES</Text>
        <Pressable style={({ pressed }) => [styles.currencyRow, pressed && styles.pressed]} onPress={() => setCurrencyPickerOpen(true)}>
          <View style={styles.prefIcon}><MaterialIcons name="attach-money" size={19} color={colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.prefTitle}>Default currency</Text>
            <Text style={styles.prefDetail}>{activeCurrency.code} — {activeCurrency.name}</Text>
          </View>
          <View style={styles.currencyChip}><Text style={styles.currencyChipText}>{activeCurrency.code}</Text></View>
          <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
        </Pressable>
      </ScrollView>

      {currencyPickerOpen ? (
        <View style={styles.sheetOverlay}>
          <View style={styles.sheetCard}>
            <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Choose a currency</Text><Pressable accessibilityLabel="Close" onPress={() => setCurrencyPickerOpen(false)} hitSlop={8}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable></View>
            <Text style={styles.groupCopy}>All amounts in the app will display in this currency.</Text>
            <ScrollView style={{ marginTop: 12, maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {SUPPORTED_CURRENCIES.map((option) => {
                const active = option.code === currency;
                return (
                  <Pressable key={option.code} onPress={() => { setCurrency(option.code); setCurrencyPickerOpen(false); }} style={({ pressed }) => [styles.currencyOption, pressed && styles.pressed]}>
                    <View style={[styles.currencyOptionIcon, active && { backgroundColor: `${colors.primary}22`, borderColor: colors.primary }]}><Text style={[styles.currencyOptionSymbol, active && { color: colors.primary }]}>{option.symbol}</Text></View>
                    <View style={{ flex: 1 }}><Text style={styles.prefTitle}>{option.name}</Text><Text style={styles.prefDetail}>{option.code}</Text></View>
                    {active ? <MaterialIcons name="check" size={20} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      ) : null}

      {pinMode ? (
        <View style={styles.sheetOverlay}>
          <View style={styles.sheetCard}>
            <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>{pinMode === "setup" ? "Choose your PIN" : "Change your PIN"}</Text><Pressable accessibilityLabel="Close" onPress={closePinPrompt} hitSlop={8}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable></View>
            <Text style={styles.groupCopy}>Use {MIN_PIN_LENGTH} or more digits. You&apos;ll be asked for it each time the app opens.</Text>
            <TextInput
              value={pinInput}
              onChangeText={(text) => { setPinInput(text.replace(/\D/g, "")); setPinError(null); }}
              secureTextEntry
              keyboardType="number-pad"
              autoFocus
              placeholder="••••"
              placeholderTextColor={colors.muted}
              maxLength={12}
              style={[styles.pinInput, pinError && { borderColor: colors.error }]}
            />
            {pinError ? <Text style={[styles.pinError, { color: colors.error }]}>{pinError}</Text> : null}
            <Pressable onPress={() => { void submitPin(); }} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>{pinMode === "setup" ? "Turn on PIN lock" : "Save PIN"}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const makeStyles = (c: ThemeColorPalette) => StyleSheet.create({
  kicker: { color: c.muted, fontSize: 10, letterSpacing: 1.4, fontWeight: "800", marginTop: 4 },
  title: { color: c.foreground, fontFamily: "Georgia", fontSize: 31, lineHeight: 36, marginTop: 7 },
  identity: { minHeight: 82, marginTop: 23, backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 23, padding: 16, flexDirection: "row", alignItems: "center", gap: 13 },
  monogram: { width: 48, height: 48, borderRadius: 17, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" },
  monogramText: { color: "#FFFDF9", fontFamily: "Georgia", fontSize: 16 },
  identityTitle: { color: c.foreground, fontSize: 15, fontWeight: "800" },
  identityCopy: { color: c.muted, fontSize: 12, marginTop: 4 },
  sectionLabel: { color: c.muted, fontSize: 10, letterSpacing: 1.1, fontWeight: "800", marginTop: 26, marginBottom: 9 },
  group: { borderRadius: 21, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, padding: 15 },
  groupTitle: { color: c.foreground, fontSize: 14, fontWeight: "800" },
  groupCopy: { color: c.muted, fontSize: 12, marginTop: 4 },
  themes: { flexDirection: "row", gap: 7, marginTop: 14 },
  themeChoice: { flex: 1, minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  themeChoiceActive: { backgroundColor: c.primary, borderColor: c.primary },
  themeText: { color: c.muted, fontSize: 11, fontWeight: "800" },
  themeTextActive: { color: "#FFFDF9" },
  preference: { minHeight: 57, flexDirection: "row", alignItems: "center", gap: 11 },
  prefAction: { minHeight: 57, flexDirection: "row", alignItems: "center", gap: 11 },
  prefActionDisabled: { opacity: 0.45 },
  prefIcon: { width: 37, height: 37, borderRadius: 13, backgroundColor: `${c.primary}12`, alignItems: "center", justifyContent: "center" },
  prefTitle: { color: c.foreground, fontSize: 13, fontWeight: "800" },
  prefDetail: { color: c.muted, fontSize: 11, marginTop: 3 },
  line: { height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginLeft: 48 },
  currencyRow: { minHeight: 65, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, paddingVertical: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  currencyChip: { borderRadius: 11, backgroundColor: `${c.primary}14`, paddingHorizontal: 11, paddingVertical: 7 },
  currencyChipText: { color: c.primary, fontSize: 12, fontWeight: "800" },
  currencyOption: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 10 },
  currencyOptionIcon: { width: 37, height: 37, borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.background, alignItems: "center", justifyContent: "center" },
  currencyOptionSymbol: { color: c.muted, fontSize: 12, fontWeight: "800" },
  sheetOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,.35)", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 50 },
  sheetCard: { width: "100%", maxWidth: 400, backgroundColor: c.surface, borderRadius: 24, borderWidth: 1, borderColor: c.border, padding: 20 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  sheetTitle: { color: c.foreground, fontFamily: "Georgia", fontSize: 20 },
  pinInput: { borderWidth: 1, borderColor: c.border, borderRadius: 15, backgroundColor: c.background, color: c.foreground, fontSize: 22, paddingHorizontal: 16, height: 52, marginTop: 16, letterSpacing: 8 },
  pinError: { fontSize: 12, fontWeight: "700", marginTop: 10 },
  primary: { backgroundColor: c.primary, minHeight: 50, borderRadius: 15, marginTop: 18, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#FFFDF9", fontSize: 14, fontWeight: "800" },
  pressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
});