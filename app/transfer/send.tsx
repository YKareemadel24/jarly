import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";

import { QrCode } from "@/components/qr-code";
import { ScreenContainer } from "@/components/screen-container";
import { type ThemeColorPalette } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import { useJarAccents } from "@/hooks/use-jar-accents";
import { feedback } from "@/lib/haptics";
import { useSavings } from "@/lib/savings-store";
import { useSettings } from "@/lib/settings-store";

/**
 * Showing a transfer to another device.
 *
 * One code per screen, with the receiver free to read them in any order: every
 * frame carries its own index and the total, so a missed scan is a retry of one
 * code rather than a restart. The codes contain every jar's full history, so the
 * screen is explicit that this is the moment to be sure who is looking.
 */
export default function TransferSendScreen() {
  const colors = useColors();
  const accents = useJarAccents();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { exportTransfer, localJars } = useSavings();
  const { currency } = useSettings();

  // Built once per mount: re-encoding on every render would produce a new
  // transfer id and invalidate codes the receiver has already scanned.
  const [frames] = useState<string[]>(() => exportTransfer(currency));
  const [index, setIndex] = useState(0);

  const portable = localJars.filter((jar) => !jar.archived);
  const current = frames[index] ?? "";
  const multiple = frames.length > 1;

  const step = (delta: number) => {
    feedback.tap();
    setIndex((value) => Math.min(frames.length - 1, Math.max(0, value + delta)));
  };

  const shareText = async () => {
    feedback.tap();
    try {
      await Share.share({ message: frames.join("\n") });
    } catch {
      // Dismissing the share sheet is not a failure.
    }
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="p-5">
      <View style={styles.header}>
        <Pressable accessibilityLabel="Go back" onPress={() => router.back()} style={({ pressed }) => [styles.circle, pressed && styles.pressed]}>
          <MaterialIcons name="arrow-back" size={20} color={colors.foreground} />
        </Pressable>
        {multiple ? (
          <View style={styles.counter}>
            <Text style={styles.counterText}>
              {index + 1} of {frames.length}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.title}>Show this to the other phone.</Text>
      <Text style={styles.copy}>
        {portable.length === 0
          ? "You have no jars on this device to move yet."
          : `${portable.length} ${portable.length === 1 ? "jar" : "jars"} and their full history. The other phone reads it with its camera.`}
      </Text>

      <View style={styles.qrWrap}>
        <QrCode value={current} size={264} />
      </View>

      {multiple ? (
        <View style={styles.pager}>
          <Pressable
            accessibilityLabel="Previous code"
            disabled={index === 0}
            onPress={() => step(-1)}
            style={({ pressed }) => [styles.pageButton, index === 0 && styles.disabled, pressed && index > 0 && styles.pressed]}
          >
            <MaterialIcons name="chevron-left" size={22} color={colors.foreground} />
          </Pressable>
          <View style={styles.dots}>
            {frames.map((_, dot) => (
              <View key={dot} style={[styles.dot, dot === index && { backgroundColor: colors.primary, width: 16 }]} />
            ))}
          </View>
          <Pressable
            accessibilityLabel="Next code"
            disabled={index === frames.length - 1}
            onPress={() => step(1)}
            style={({ pressed }) => [styles.pageButton, index === frames.length - 1 && styles.disabled, pressed && index < frames.length - 1 && styles.pressed]}
          >
            <MaterialIcons name="chevron-right" size={22} color={colors.foreground} />
          </Pressable>
        </View>
      ) : null}

      {multiple ? (
        <Text style={styles.hint}>
          The other phone can read these in any order. Keep tapping through until every code has been scanned.
        </Text>
      ) : null}

      <Pressable onPress={shareText} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
        <MaterialIcons name="content-copy" size={17} color={colors.foreground} />
        <Text style={styles.secondaryText}>Send the codes as text instead</Text>
      </Pressable>

      <View style={styles.warning}>
        <MaterialIcons name="visibility" size={16} color={accents.coral} />
        <Text style={[styles.warningText, { color: accents.coral }]}>
          These codes carry your jars and their history. Only show them to a device you trust.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const makeStyles = (c: ThemeColorPalette) =>
  StyleSheet.create({
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    circle: { width: 38, height: 38, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
    counter: { borderRadius: 999, backgroundColor: `${c.primary}18`, paddingHorizontal: 12, paddingVertical: 7 },
    counterText: { color: c.primary, fontSize: 12, fontWeight: "800" },
    title: { color: c.foreground, fontFamily: "Georgia", fontSize: 24, lineHeight: 30, marginTop: 18 },
    copy: { color: c.muted, fontSize: 13, lineHeight: 19, marginTop: 8 },
    qrWrap: { alignSelf: "center", marginTop: 20, padding: 12, borderRadius: 24, backgroundColor: "#FFFDF9", borderWidth: 1, borderColor: c.border },
    pager: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 16 },
    pageButton: { width: 42, height: 42, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
    dots: { flexDirection: "row", gap: 5, maxWidth: 200, flexWrap: "wrap", justifyContent: "center" },
    dot: { width: 6, height: 6, borderRadius: 99, backgroundColor: c.border },
    hint: { color: c.muted, fontSize: 11.5, lineHeight: 17, marginTop: 12, textAlign: "center" },
    secondary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 48, borderRadius: 15, borderWidth: 1, borderColor: c.border, marginTop: 18 },
    secondaryText: { color: c.foreground, fontSize: 13, fontWeight: "800" },
    warning: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 18 },
    warningText: { fontSize: 11.5, lineHeight: 17, flex: 1, fontWeight: "700" },
    disabled: { opacity: 0.35 },
    pressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
  });