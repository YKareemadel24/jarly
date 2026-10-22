import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { makeStyles } from "@/components/profile.styles";
import { ActionSheet } from "@/components/action-sheet";
import { BackupPanel } from "@/components/backup-panel";
import { ScreenContainer } from "@/components/screen-container";
import { type ThemeColorPalette } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import {
  MIN_PIN_LENGTH,
  SUPPORTED_CURRENCIES,
  useSettings,
} from "@/lib/settings-store";
import { requestPermissionAndEnable } from "@/lib/notifications";
import { type Jar, useMoney, useSavings } from "@/lib/savings-store";
import { useThemeContext } from "@/lib/theme-provider";

function Preference({
  icon,
  title,
  detail,
  value,
  onChange,
  disabled,
  styles,
  colors,
}: {
  icon: string;
  title: string;
  detail: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColorPalette;
}) {
  return (
    <View style={styles.preference}>
      <View style={styles.prefIcon}>
        <MaterialIcons name={icon as never} size={19} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.prefTitle}>{title}</Text>
        <Text style={styles.prefDetail}>{detail}</Text>
      </View>
      <Switch
        accessibilityRole="switch"
        accessibilityLabel={title}
        accessibilityHint={detail}
        accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: colors.border, true: `${colors.primary}8C` }}
        thumbColor={value ? colors.primary : "#FFFDF9"}
      />
    </View>
  );
}

type PinPromptMode =
  | "setup"
  | "change"
  | "verify-pin-disable"
  | "verify-biometric-disable";

export default function ProfileScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { appearanceMode, setAppearanceMode } = useThemeContext();
  const {
    remindersEnabled,
    setRemindersEnabled,
    biometricAvailable,
    biometricLockEnabled,
    setBiometricLockEnabled,
    pinLockEnabled,
    hasPin,
    pinLength,
    setPin,
    tryUnlock,
    enablePinLock,
    disablePinLock,
    authenticateWithBiometrics,
    currency,
    setCurrency,
  } = useSettings();
  const { jars, restoreJar, deleteJarPermanently } = useSavings();
  const format = useMoney();
  const archived = useMemo(() => jars.filter((jar) => jar.archived), [jars]);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [pinMode, setPinMode] = useState<PinPromptMode | null>(null);
  // Alert.alert is a no-op on web, so confirmations and notices are in-app sheets.
  const [pendingDelete, setPendingDelete] = useState<Jar | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const activeCurrency =
    SUPPORTED_CURRENCIES.find((c) => c.code === currency) ??
    SUPPORTED_CURRENCIES[0];

  const openPinPrompt = (mode: PinPromptMode) => {
    setPinInput("");
    setPinError(null);
    setPinMode(mode);
  };
  const closePinPrompt = () => {
    setPinMode(null);
    setPinInput("");
    setPinError(null);
  };

  const submitPin = async () => {
    if (
      pinMode === "verify-pin-disable" ||
      pinMode === "verify-biometric-disable"
    ) {
      if (pinInput.length !== (pinLength ?? MIN_PIN_LENGTH)) {
        setPinError("Enter your current PIN.");
        return;
      }
      const result = await tryUnlock(pinInput);
      if (result !== "ok") {
        setPinError(
          result === "locked"
            ? "Too many tries. Wait before trying again."
            : "That PIN didn’t match.",
        );
        return;
      }
      if (pinMode === "verify-pin-disable") await disablePinLock();
      else setBiometricLockEnabled(false);
      closePinPrompt();
      return;
    }
    if (pinInput.length < MIN_PIN_LENGTH) {
      setPinError(`Use ${MIN_PIN_LENGTH} or more digits.`);
      return;
    }
    const ok = await setPin(pinInput);
    if (!ok) {
      setPinError("Could not save that PIN. Try again.");
      return;
    }
    if (pinMode === "setup" && !(await enablePinLock())) {
      setPinError("Could not enable the PIN lock. Try again.");
      return;
    }
    closePinPrompt();
  };

  const onPinLockChange = (next: boolean) => {
    if (next) {
      if (hasPin) {
        void enablePinLock().then((ok) => {
          if (!ok) setNotice("Could not enable the PIN lock. Try again.");
        });
      } else {
        openPinPrompt("setup");
      }
    } else {
      if (biometricLockEnabled && biometricAvailable) {
        void authenticateWithBiometrics().then((ok) => {
          if (ok) void disablePinLock();
          else
            setNotice(
              "Verify with biometrics before turning off the PIN lock.",
            );
        });
      } else {
        openPinPrompt("verify-pin-disable");
      }
    }
  };

  const onBiometricLockChange = (next: boolean) => {
    if (next) {
      setBiometricLockEnabled(true);
      return;
    }
    if (!biometricLockEnabled) return;
    if (biometricAvailable) {
      void authenticateWithBiometrics().then((ok) => {
        if (ok) setBiometricLockEnabled(false);
        else
          setNotice(
            "Verify with biometrics before turning off fingerprint unlock.",
          );
      });
    } else if (hasPin) {
      openPinPrompt("verify-biometric-disable");
    } else {
      setNotice(
        "Authentication is unavailable. Restore device biometrics before changing this lock.",
      );
    }
  };

  const onRemindersChange = (next: boolean) => {
    if (!next) {
      setRemindersEnabled(false);
      return;
    }
    void requestPermissionAndEnable()
      .then((granted) => {
        if (granted) {
          setRemindersEnabled(true);
        } else {
          setNotice(
            "Saving reminders stays off until you allow notifications in system Settings.",
          );
        }
      })
      .catch(() => {
        setNotice("Could not check notification permission. Try again.");
      });
  };

  return (
    <ScreenContainer className="p-5">
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>PROFILE</Text>
        <Text style={styles.title}>Make it feel{"\n"}like yours.</Text>

        <View style={styles.identity}>
          <View style={styles.monogram}>
            <Text style={styles.monogramText}>SJ</Text>
          </View>
          <View>
            <Text style={styles.identityTitle}>Your Saving Jar</Text>
            <Text style={styles.identityCopy}>A private progress tracker</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>APPEARANCE</Text>
        <View style={styles.group}>
          <Text style={styles.groupTitle}>Theme</Text>
          <Text style={styles.groupCopy}>
            Choose the view that feels most comfortable.
          </Text>
          <View style={styles.themes}>
            {(["light", "dark", "system"] as const).map((mode) => (
              <Pressable
                key={mode}
                onPress={() => setAppearanceMode(mode)}
                style={({ pressed }) => [
                  styles.themeChoice,
                  appearanceMode === mode && styles.themeChoiceActive,
                  pressed && styles.pressed,
                ]}
              >
                <MaterialIcons
                  name={
                    (mode === "light"
                      ? "light-mode"
                      : mode === "dark"
                        ? "dark-mode"
                        : "brightness-auto") as never
                  }
                  size={17}
                  color={appearanceMode === mode ? "#FFFDF9" : colors.muted}
                />
                <Text
                  style={[
                    styles.themeText,
                    appearanceMode === mode && styles.themeTextActive,
                  ]}
                >
                  {mode === "system"
                    ? "Auto"
                    : mode[0].toUpperCase() + mode.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={styles.sectionLabel}>GENTLE SUPPORT</Text>
        <View style={styles.group}>
          <Preference
            icon="notifications-none"
            title="Saving reminders"
            detail="Daily savings check-in plus due deposit and deadline nudges"
            value={remindersEnabled}
            onChange={onRemindersChange}
            styles={styles}
            colors={colors}
          />
          <View style={styles.line} />
          <Preference
            icon="fingerprint"
            title="Fingerprint unlock"
            detail={
              biometricAvailable
                ? "Require your fingerprint or face to open your jar"
                : "Set up fingerprint or face unlock on this device to use this"
            }
            value={biometricLockEnabled && biometricAvailable}
            onChange={onBiometricLockChange}
            disabled={!biometricAvailable}
            styles={styles}
            colors={colors}
          />
          <View style={styles.line} />
          <Preference
            icon="lock-outline"
            title="PIN lock"
            detail="Use a 4–12 digit code if you'd rather not use biometrics"
            value={pinLockEnabled}
            onChange={onPinLockChange}
            styles={styles}
            colors={colors}
          />
          <View style={styles.line} />
          <Pressable
            disabled={!pinLockEnabled}
            style={({ pressed }) => [
              styles.prefAction,
              !pinLockEnabled && styles.prefActionDisabled,
              pressed && pinLockEnabled && styles.pressed,
            ]}
            onPress={() =>
              pinLockEnabled
                ? hasPin
                  ? openPinPrompt("change")
                  : openPinPrompt("setup")
                : undefined
            }
          >
            <View style={styles.prefIcon}>
              <MaterialIcons name="key" size={19} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.prefTitle}>
                {(hasPin ? "Change" : "Set") + " " + "PIN"}
              </Text>
              <Text style={styles.prefDetail}>
                {!pinLockEnabled
                  ? "Turn on PIN lock first."
                  : hasPin
                    ? "Update the code that unlocks your jar."
                    : "Choose a code so only you can open it."}
              </Text>
            </View>
            {pinLockEnabled ? (
              <MaterialIcons
                name="chevron-right"
                size={20}
                color={colors.muted}
              />
            ) : null}
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>PREFERENCES</Text>
        <Pressable
          style={({ pressed }) => [
            styles.currencyRow,
            pressed && styles.pressed,
          ]}
          onPress={() => setCurrencyPickerOpen(true)}
        >
          <View style={styles.prefIcon}>
            <MaterialIcons
              name="attach-money"
              size={19}
              color={colors.primary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.prefTitle}>Default currency</Text>
            <Text style={styles.prefDetail}>
              {activeCurrency.code} — {activeCurrency.name}
            </Text>
          </View>
          <View style={styles.currencyChip}>
            <Text style={styles.currencyChipText}>{activeCurrency.code}</Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
        </Pressable>

        <Text style={styles.sectionLabel}>YOUR DEVICES</Text>
        <Pressable
          accessibilityLabel="Move jars to another device"
          style={({ pressed }) => [
            styles.currencyRow,
            pressed && styles.pressed,
          ]}
          onPress={() => router.push("/transfer" as never)}
        >
          <View style={styles.prefIcon}>
            <MaterialIcons name="devices" size={19} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.prefTitle}>Move to another device</Text>
            <Text style={styles.prefDetail}>
              Pass your jars across with a code — no account, no network.
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
        </Pressable>

        <BackupPanel />

        <Text style={styles.sectionLabel}>ARCHIVED</Text>
        <View style={styles.group}>
          {archived.length === 0 ? (
            <Text style={styles.groupCopy}>
              Nothing archived. Archiving removes a jar from your active goals
              while keeping its history.
            </Text>
          ) : (
            archived.map((jar, index) => (
              <View key={jar.id}>
                {index > 0 ? <View style={styles.line} /> : null}
                <View style={styles.preference}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.prefTitle} numberOfLines={1}>
                      {jar.name}
                    </Text>
                    <Text style={styles.prefDetail}>
                      {format(jar.balance)} saved
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel={`Restore ${jar.name}`}
                    onPress={() => restoreJar(jar.id)}
                    style={({ pressed }) => [
                      styles.currencyChip,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.currencyChipText}>Restore</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`Delete ${jar.name} permanently`}
                    onPress={() => setPendingDelete(jar)}
                    hitSlop={8}
                  >
                    <MaterialIcons
                      name="delete-outline"
                      size={20}
                      color={colors.muted}
                    />
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {currencyPickerOpen ? (
        <View style={styles.sheetOverlay}>
          <View style={styles.sheetCard}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Choose a currency</Text>
              <Pressable
                accessibilityLabel="Close"
                onPress={() => setCurrencyPickerOpen(false)}
                hitSlop={8}
              >
                <MaterialIcons name="close" size={20} color={colors.muted} />
              </Pressable>
            </View>
            <Text style={styles.groupCopy}>
              All amounts in the app will display in this currency.
            </Text>
            <ScrollView
              style={{ marginTop: 12, maxHeight: 360 }}
              showsVerticalScrollIndicator={false}
            >
              {SUPPORTED_CURRENCIES.map((option) => {
                const active = option.code === currency;
                return (
                  <Pressable
                    key={option.code}
                    onPress={() => {
                      setCurrency(option.code);
                      setCurrencyPickerOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.currencyOption,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.currencyOptionIcon,
                        active && {
                          backgroundColor: `${colors.primary}22`,
                          borderColor: colors.primary,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.currencyOptionSymbol,
                          active && { color: colors.primary },
                        ]}
                      >
                        {option.symbol}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.prefTitle}>{option.name}</Text>
                      <Text style={styles.prefDetail}>{option.code}</Text>
                    </View>
                    {active ? (
                      <MaterialIcons
                        name="check"
                        size={20}
                        color={colors.primary}
                      />
                    ) : null}
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
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {pinMode === "setup"
                  ? "Choose your PIN"
                  : pinMode === "change"
                    ? "Change your PIN"
                    : "Verify your PIN"}
              </Text>
              <Pressable
                accessibilityLabel="Close"
                onPress={closePinPrompt}
                hitSlop={8}
              >
                <MaterialIcons name="close" size={20} color={colors.muted} />
              </Pressable>
            </View>
            <Text style={styles.groupCopy}>
              {pinMode.startsWith("verify-")
                ? "Confirm your PIN before changing the app lock."
                : `Use ${MIN_PIN_LENGTH} or more digits. You’ll be asked for it each time the app opens.`}
            </Text>
            <TextInput
              value={pinInput}
              onChangeText={(text) => {
                setPinInput(text.replace(/\D/g, ""));
                setPinError(null);
              }}
              secureTextEntry
              keyboardType="number-pad"
              autoFocus
              placeholder="••••"
              placeholderTextColor={colors.muted}
              maxLength={12}
              style={[
                styles.pinInput,
                pinError && { borderColor: colors.error },
              ]}
            />
            {pinError ? (
              <Text style={[styles.pinError, { color: colors.error }]}>
                {pinError}
              </Text>
            ) : null}
            <Pressable
              onPress={() => {
                void submitPin();
              }}
              style={({ pressed }) => [
                styles.primary,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryText}>
                {pinMode === "setup"
                  ? "Turn on PIN lock"
                  : pinMode.startsWith("verify-")
                    ? "Verify PIN"
                    : "Save PIN"}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <ActionSheet
        visible={notice !== null}
        title="Notifications off"
        message={notice ?? ""}
        actions={[{ label: "Got it", onPress: () => undefined }]}
        onDismiss={() => setNotice(null)}
      />

      <ActionSheet
        visible={pendingDelete !== null}
        title="Delete forever?"
        message={
          pendingDelete
            ? `${pendingDelete.name} and its history will be permanently removed.`
            : ""
        }
        actions={[
          {
            label: "Delete",
            detail: "This cannot be undone.",
            destructive: true,
            icon: "delete-outline",
            onPress: () => {
              if (pendingDelete) deleteJarPermanently(pendingDelete.id);
            },
          },
          { label: "Cancel", onPress: () => undefined },
        ]}
        onDismiss={() => setPendingDelete(null)}
      />
    </ScreenContainer>
  );
}
