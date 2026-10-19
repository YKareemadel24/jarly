import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { makeStyles } from "@/components/transfer-index.styles";

import { ScreenContainer } from "@/components/screen-container";
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
        <Pressable
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.circle, pressed && styles.pressed]}
        >
          <MaterialIcons
            name="arrow-back"
            size={20}
            color={colors.foreground}
          />
        </Pressable>
      </View>

      <Text style={styles.kicker}>MOVE YOUR JARS</Text>
      <Text style={styles.title}>Bring it{"\n"}with you.</Text>
      <Text style={styles.copy}>
        Move your jars straight from one phone to another. Nothing is uploaded,
        and both devices can be offline.
      </Text>

      <View
        style={[
          styles.summary,
          {
            backgroundColor: `${accents.ocean}12`,
            borderColor: `${accents.ocean}33`,
          },
        ]}
      >
        <View style={styles.summaryRow}>
          <Text style={styles.summaryValue}>{portable.length}</Text>
          <Text style={styles.summaryLabel}>
            {portable.length === 1 ? "jar" : "jars"} ready to move
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryValue}>{entries}</Text>
          <Text style={styles.summaryLabel}>
            {entries === 1 ? "entry" : "entries"} of history
          </Text>
        </View>
      </View>

      <Pressable
        onPress={() => {
          feedback.tap();
          router.push("/transfer/send" as never);
        }}
        style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
      >
        <View
          style={[styles.choiceIcon, { backgroundColor: `${accents.mint}1F` }]}
        >
          <MaterialIcons name="qr-code-2" size={22} color={accents.mint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.choiceTitle}>Send from this device</Text>
          <Text style={styles.choiceCopy}>
            Show codes on this screen for the other phone to read.
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
      </Pressable>

      <Pressable
        onPress={() => {
          feedback.tap();
          router.push("/transfer/receive" as never);
        }}
        style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
      >
        <View
          style={[styles.choiceIcon, { backgroundColor: `${accents.amber}1F` }]}
        >
          <MaterialIcons name="move-to-inbox" size={22} color={accents.amber} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.choiceTitle}>Receive on this device</Text>
          <Text style={styles.choiceCopy}>
            Bring jars in from another phone.
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
      </Pressable>

      <View style={styles.note}>
        <MaterialIcons name="info-outline" size={16} color={colors.muted} />
        <Text style={styles.noteText}>
          Jars you share with other people are not copied — they already live on
          your device.
        </Text>
      </View>
    </ScreenContainer>
  );
}
