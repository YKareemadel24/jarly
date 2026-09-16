import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { type ThemeColorPalette } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import { useJarAccents } from "@/hooks/use-jar-accents";
import { feedback } from "@/lib/haptics";
import { useSavings } from "@/lib/savings-store";

/**
 * The door to moving jars between devices.
 *
 * A transfer never touches the network: it is one phone showing codes and
 * another reading them. That is the whole point — it works on a plane, it works
 * when the server is down, and nothing about a personal jar leaves the two
 * devices involved.
 */
export default function TransferScreen() {
  const colors = useColors();
  const accents = useJarAccents();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { localJars } = useSavings();

  const portable = localJars.filter((jar) => !jar.archived);
  const entries = portable.reduce((sum, jar) => sum + jar.entries.length, 0);

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="p-5">
      <View style={styles.header}>
        <Pressable accessibilityLabel="Go back" onPress={() => router.back()} style={({ pressed }) => [styles.circle, pressed && styles.pressed]}>
          <MaterialIcons name="arrow-back" size={20} color={colors.foreground} />
        </Pressable>
      </View>

      <Text style={styles.kicker}>MOVE YOUR JARS</Text>
      <Text style={styles.title}>Bring it{"\n"}with you.</Text>
      <Text style={styles.copy}>
        Move your jars straight from one phone to another. Nothing is uploaded, and both devices can be offline.
      </Text>

      <View style={[styles.summary, { backgroundColor: `${accents.ocean}12`, borderColor: `${accents.ocean}33` }]}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryValue}>{portable.length}</Text>
          <Text style={styles.summaryLabel}>{portable.length === 1 ? "jar" : "jars"} ready to move</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryValue}>{entries}</Text>
          <Text style={styles.summaryLabel}>{entries === 1 ? "entry" : "entries"} of history</Text>
        </View>
      </View>

      <Pressable
        onPress={() => { feedback.tap(); router.push("/transfer/send" as never); }}
        style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
      >
        <View style={[styles.choiceIcon, { backgroundColor: `${accents.mint}1F` }]}>
          <MaterialIcons name="qr-code-2" size={22} color={accents.mint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.choiceTitle}>Send from this device</Text>
          <Text style={styles.choiceCopy}>Show codes on this screen for the other phone to read.</Text>
        </View>
        <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
      </Pressable>

      <Pressable
        onPress={() => { feedback.tap(); router.push("/transfer/receive" as never); }}
        style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
      >
        <View style={[styles.choiceIcon, { backgroundColor: `${accents.amber}1F` }]}>
          <MaterialIcons name="move-to-inbox" size={22} color={accents.amber} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.choiceTitle}>Receive on this device</Text>
          <Text style={styles.choiceCopy}>Bring jars in from another phone.</Text>
        </View>
        <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
      </Pressable>

      <View style={styles.note}>
        <MaterialIcons name="info-outline" size={16} color={colors.muted} />
        <Text style={styles.noteText}>
          Jars you share with other people are not copied — they already live on your account, so signing in is all they need.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const makeStyles = (c: ThemeColorPalette) =>
  StyleSheet.create({
    header: { flexDirection: "row", justifyContent: "flex-start" },
    circle: { width: 38, height: 38, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
    kicker: { color: c.muted, fontSize: 10, letterSpacing: 1.4, fontWeight: "800", marginTop: 18 },
    title: { color: c.foreground, fontFamily: "Georgia", fontSize: 31, lineHeight: 36, marginTop: 8 },
    copy: { color: c.muted, fontSize: 13.5, lineHeight: 20, marginTop: 10 },
    summary: { flexDirection: "row", alignItems: "center", borderRadius: 22, borderWidth: 1, padding: 16, marginTop: 20 },
    summaryRow: { flex: 1, alignItems: "center" },
    summaryValue: { color: c.foreground, fontFamily: "Georgia", fontSize: 24 },
    summaryLabel: { color: c.muted, fontSize: 11, marginTop: 3, fontWeight: "700" },
    summaryDivider: { width: StyleSheet.hairlineWidth, alignSelf: "stretch", backgroundColor: c.border },
    choice: { flexDirection: "row", alignItems: "center", gap: 13, marginTop: 14, borderRadius: 21, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: 15 },
    choiceIcon: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" },
    choiceTitle: { color: c.foreground, fontSize: 14, fontWeight: "800" },
    choiceCopy: { color: c.muted, fontSize: 11.5, marginTop: 3, lineHeight: 16 },
    note: { flexDirection: "row", gap: 8, marginTop: 22, alignItems: "flex-start" },
    noteText: { color: c.muted, fontSize: 11.5, lineHeight: 17, flex: 1 },
    pressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  });