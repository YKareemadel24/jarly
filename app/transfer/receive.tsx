import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { Toast } from "@/components/toast";
import { type ThemeColorPalette } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import { useJarAccents } from "@/hooks/use-jar-accents";
import { feedback } from "@/lib/haptics";
import { useSavings } from "@/lib/savings-store";
import { TRANSFER_PREFIX, decodeTransferFrames } from "@/shared/transfer";

type Stage = "collect" | "done";

/**
 * Bringing jars onto this device.
 *
 * The frames arrive one at a time, in whatever order the sender managed to show
 * them, and the screen reports exactly which ones are still missing. Nothing is
 * written until the whole transfer decodes, so a half-finished scan can never
 * leave a partially-imported jar list behind.
 *
 * Frames are collected as text rather than through a camera: this build has no
 * camera module, and a paste field is honest about that. The collection and
 * decoding logic below is camera-agnostic — a scanner only has to call `accept`
 * with each frame it reads.
 */
export default function TransferReceiveScreen() {
  const colors = useColors();
  const accents = useJarAccents();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { importTransfer } = useSavings();

  const [frames, setFrames] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [stage, setStage] = useState<Stage>("collect");
  const [result, setResult] = useState<{ added: number; updated: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const assembly = useMemo(() => decodeTransferFrames(frames), [frames]);

  /** Add one frame. Returns false when it is not a frame this app understands. */
  const accept = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text.startsWith(`${TRANSFER_PREFIX}.`)) return false;
      setFrames((current) => (current.includes(text) ? current : [...current, text]));
      return true;
    },
    [],
  );

  const addDraft = () => {
    const lines = draft.split(/\s+/).filter(Boolean);
    let accepted = 0;
    for (const line of lines) {
      if (accept(line)) accepted += 1;
    }
    if (accepted === 0) {
      feedback.error();
      setError("That is not a Saving Jar code. Check you copied the whole line.");
      return;
    }
    feedback.tap();
    setDraft("");
    setError(null);
    setToast(accepted === 1 ? "Code added." : `${accepted} codes added.`);
  };

  const finish = () => {
    const outcome = importTransfer(frames);
    if (outcome.error) {
      feedback.error();
      setError(outcome.error);
      return;
    }
    feedback.success();
    setResult({ added: outcome.added, updated: outcome.updated, skipped: outcome.skipped });
    setStage("done");
  };

  const reset = () => {
    setFrames([]);
    setDraft("");
    setResult(null);
    setError(null);
    setStage("collect");
  };

  const complete = assembly?.snapshot !== undefined;

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="p-5">
      <View style={styles.header}>
        <Pressable accessibilityLabel="Go back" onPress={() => router.back()} style={({ pressed }) => [styles.circle, pressed && styles.pressed]}>
          <MaterialIcons name="arrow-back" size={20} color={colors.foreground} />
        </Pressable>
      </View>

      {stage === "done" && result ? (
        <View style={styles.doneBody}>
          <View style={[styles.doneIcon, { backgroundColor: `${accents.mint}1F` }]}>
            <MaterialIcons name="check-circle" size={30} color={accents.mint} />
          </View>
          <Text style={styles.title}>They are here.</Text>
          <Text style={styles.copy}>
            {result.added > 0 ? `${result.added} ${result.added === 1 ? "jar" : "jars"} added. ` : ""}
            {result.updated > 0 ? `${result.updated} updated from a fuller history. ` : ""}
            {result.added === 0 && result.updated === 0 ? "Everything was already on this device. " : ""}
            {result.skipped > 0 ? `${result.skipped} left alone because this device already had more.` : ""}
          </Text>
          <Pressable onPress={() => router.replace("/(tabs)" as never)} style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
            <Text style={styles.primaryText}>See my jars</Text>
          </Pressable>
          <Pressable onPress={reset} style={styles.secondary}>
            <Text style={styles.secondaryText}>Bring in more</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <Text style={styles.kicker}>RECEIVE</Text>
          <Text style={styles.title}>Add the codes{"\n"}from the other phone.</Text>
          <Text style={styles.copy}>
            Paste each code the other phone shows. They can go in any order, and adding one twice does nothing.
          </Text>

          {assembly && assembly.total > 0 ? (
            <View style={[styles.progress, { borderColor: complete ? accents.mint : colors.border, backgroundColor: complete ? `${accents.mint}12` : colors.surface }]}>
              <View style={styles.progressHead}>
                <Text style={styles.progressLabel}>{complete ? "ALL CODES IN" : "COLLECTING"}</Text>
                <Text style={[styles.progressCount, complete && { color: accents.mint }]}>
                  {assembly.have.length} of {assembly.total}
                </Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round((assembly.have.length / assembly.total) * 100)}%`, backgroundColor: complete ? accents.mint : colors.primary }]} />
              </View>
              {!complete && assembly.missing.length > 0 ? (
                <Text style={styles.missing}>
                  Still need {assembly.missing.slice(0, 8).join(", ")}
                  {assembly.missing.length > 8 ? ` and ${assembly.missing.length - 8} more` : ""}.
                </Text>
              ) : null}
              {assembly.error ? <Text style={[styles.missing, { color: colors.error }]}>{assembly.error}</Text> : null}
            </View>
          ) : null}

          <TextInput
            value={draft}
            onChangeText={(text) => { setDraft(text); setError(null); }}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={`Paste a code starting with ${TRANSFER_PREFIX}.`}
            placeholderTextColor={colors.muted}
            style={styles.input}
          />

          <Pressable onPress={addDraft} disabled={!draft.trim()} style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary }, !draft.trim() && styles.disabled, pressed && draft.trim() && styles.pressed]}>
            <MaterialIcons name="add" size={19} color="#FFFDF9" />
            <Text style={styles.primaryText}>Add this code</Text>
          </Pressable>

          {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}

          <Pressable
            disabled={!complete}
            onPress={finish}
            style={({ pressed }) => [styles.finish, complete ? { backgroundColor: accents.mint } : styles.finishIdle, pressed && complete && styles.pressed]}
          >
            <Text style={[styles.finishText, !complete && { color: colors.muted }]}>
              {complete ? `Bring in ${assembly?.snapshot?.jars.length ?? 0} ${(assembly?.snapshot?.jars.length ?? 0) === 1 ? "jar" : "jars"}` : "Add every code to continue"}
            </Text>
          </Pressable>

          <View style={styles.note}>
            <MaterialIcons name="lock-outline" size={16} color={colors.muted} />
            <Text style={styles.noteText}>
              Nothing is written to this device until every code has arrived, so a half-finished transfer leaves your jars exactly as they were.
            </Text>
          </View>
        </ScrollView>
      )}

      <Toast visible={toast !== null} message={toast ?? ""} onDismiss={() => setToast(null)} />
    </ScreenContainer>
  );
}

const makeStyles = (c: ThemeColorPalette) =>
  StyleSheet.create({
    header: { flexDirection: "row", justifyContent: "flex-start" },
    circle: { width: 38, height: 38, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
    scroll: { paddingTop: 18, paddingBottom: 20 },
    kicker: { color: c.muted, fontSize: 10, letterSpacing: 1.4, fontWeight: "800" },
    title: { color: c.foreground, fontFamily: "Georgia", fontSize: 29, lineHeight: 35, marginTop: 8 },
    copy: { color: c.muted, fontSize: 13.5, lineHeight: 20, marginTop: 10 },
    progress: { borderRadius: 20, borderWidth: 1, padding: 15, marginTop: 20 },
    progressHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    progressLabel: { color: c.muted, fontSize: 10, letterSpacing: 1.1, fontWeight: "800" },
    progressCount: { color: c.foreground, fontSize: 13, fontWeight: "800" },
    track: { height: 6, borderRadius: 999, backgroundColor: c.border, overflow: "hidden", marginTop: 11 },
    fill: { height: "100%", borderRadius: 999 },
    missing: { color: c.muted, fontSize: 11.5, marginTop: 10, lineHeight: 16 },
    input: { marginTop: 18, minHeight: 110, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, color: c.foreground, fontSize: 12, padding: 14, textAlignVertical: "top" },
    primary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 50, borderRadius: 15, marginTop: 12 },
    primaryText: { color: "#FFFDF9", fontSize: 14, fontWeight: "800" },
    finish: { minHeight: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 20 },
    finishIdle: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    finishText: { color: "#FFFDF9", fontSize: 14.5, fontWeight: "800" },
    secondary: { minHeight: 46, alignItems: "center", justifyContent: "center", marginTop: 8 },
    secondaryText: { color: c.muted, fontSize: 13, fontWeight: "700" },
    error: { fontSize: 12, fontWeight: "700", marginTop: 12 },
    note: { flexDirection: "row", gap: 8, marginTop: 22, alignItems: "flex-start" },
    noteText: { color: c.muted, fontSize: 11.5, lineHeight: 17, flex: 1 },
    doneBody: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 40 },
    doneIcon: { width: 66, height: 66, borderRadius: 22, alignItems: "center", justifyContent: "center" },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
  });