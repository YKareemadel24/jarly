import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { JarVessel } from "@/components/jar-vessel";
import { ScreenContainer } from "@/components/screen-container";
import { type ThemeColorPalette } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import { feedback } from "@/lib/haptics";
import { useJarAccents } from "@/hooks/use-jar-accents";
import { jarAccent, money, type Accent, type JarKind, sanitizeAmountInput, toMinor, useSavings } from "@/lib/savings-store";

const accents: Accent[] = ["coral", "amber", "mint", "ocean", "berry", "clay"];
const icons = ["flight", "favorite", "laptop-mac", "home", "restaurant", "celebration"];

/**
 * Guided first-jar creation (Saving_Jar_DESIGN.md section 10): a moment,
 * not a form. Recurring deposits are introduced after the jar exists.
 */
export default function NewJar() {
  const colors = useColors();
  const accentsForScheme = useJarAccents();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { addJar } = useSavings();
  const [step, setStep] = useState(1);
  const [name, setName] = useState(""); const [target, setTarget] = useState(""); const [accent, setAccent] = useState<Accent>("ocean"); const [icon, setIcon] = useState("flight"); const [kind, setKind] = useState<JarKind>("goal"); const [deadline, setDeadline] = useState("");
  // Money is stored as integer minor units; inputs are sanitized as typed.
  const targetValue = toMinor(target);
  const accentHex = accentsForScheme[accent];
  const stepValid = step === 1 ? Boolean(name.trim()) : true;

  const goBack = () => {
    if (step === 1) return router.back();
    feedback.tap();
    setStep(step - 1);
  };
  const next = () => {
    if (!stepValid) return;
    feedback.tap();
    if (step < 3) return setStep(step + 1);
    const id = addJar({ name: name.trim(), target: targetValue!, accent, icon, kind, deadline: deadline.trim() || undefined, streak: kind === "habit" ? 0 : undefined });
    router.replace(`/jar/${id}` as never);
  };

  const previewName = name.trim() || "A goal to grow";
  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          <Pressable accessibilityLabel={step === 1 ? "Go back" : "Previous step"} onPress={goBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <MaterialIcons name="arrow-back" color={colors.foreground} size={20} />
          </Pressable>
          <Text style={styles.navTitle}>NEW JAR</Text>
          <View style={styles.stepDots}>
            {[1, 2, 3].map((dot) => <View key={dot} style={[styles.stepDot, dot <= step && { backgroundColor: accentHex }]} />)}
          </View>
        </View>

        <View style={styles.preview}>
          <JarVessel accent={accentHex} icon={icon} progress={0} size="medium" label="0%" />
          <View style={styles.previewCopy}>
            <Text style={styles.previewLabel}>YOUR NEW JAR</Text>
            <Text style={styles.previewName}>{previewName}</Text>
            <Text style={styles.previewTarget}>
              {targetValue && targetValue > 0 ? `Target ${money(targetValue)}` : kind === "goal" ? "Give it somewhere to grow." : "Build a saving rhythm."}
            </Text>
          </View>
        </View>

        {step === 1 ? (
          <>
            <Text style={styles.title}>What are you{"\n"}saving for?</Text>
            <Text style={styles.sub}>Start with the goal itself. You can shape everything else after.</Text>
            <Text style={styles.label}>WHAT KIND OF JAR?</Text>
            <View style={styles.kindRow}>
              <Pressable onPress={() => { feedback.tap(); setKind("goal"); }} style={({ pressed }) => [styles.kind, kind === "goal" && styles.kindActive, pressed && styles.pressed]}>
                <MaterialIcons name="flag" size={18} color={kind === "goal" ? "#FFFDF9" : colors.muted} />
                <View><Text style={[styles.kindTitle, kind === "goal" && styles.kindTitleActive]}>Goal</Text><Text style={[styles.kindNote, kind === "goal" && styles.kindNoteActive]}>A defined target</Text></View>
              </Pressable>
              <Pressable onPress={() => { feedback.tap(); setKind("habit"); }} style={({ pressed }) => [styles.kind, kind === "habit" && styles.kindActive, pressed && styles.pressed]}>
                <MaterialIcons name="repeat" size={18} color={kind === "habit" ? "#FFFDF9" : colors.muted} />
                <View><Text style={[styles.kindTitle, kind === "habit" && styles.kindTitleActive]}>Habit</Text><Text style={[styles.kindNote, kind === "habit" && styles.kindNoteActive]}>Build a rhythm</Text></View>
              </Pressable>
            </View>
            <Text style={styles.label}>NAME YOUR JAR</Text>
            <TextInput autoFocus value={name} onChangeText={setName} placeholder="e.g. Japan trip" placeholderTextColor={colors.muted} maxLength={60} returnKeyType="next" onSubmitEditing={next} style={styles.input} />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={styles.title}>Give it some{"\n"}personality.</Text>
            <Text style={styles.sub}>Pick an icon and a colour. This jar is yours.</Text>
            <Text style={styles.label}>CHOOSE AN ICON</Text>
            <View style={styles.iconRow}>
              {icons.map((candidate) => (
                <Pressable key={candidate} accessibilityLabel={`Choose ${candidate} icon`} onPress={() => { feedback.tap(); setIcon(candidate); }} style={({ pressed }) => [styles.iconChoice, icon === candidate && [styles.iconChoiceActive, { backgroundColor: `${accentHex}22`, borderColor: accentHex }], pressed && styles.pressed]}>
                  <MaterialIcons name={candidate as never} size={21} color={icon === candidate ? accentHex : colors.muted} />
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>CHOOSE A JAR COLOUR</Text>
            <View style={styles.colors}>
              {accents.map((candidate) => (
                <Pressable key={candidate} accessibilityLabel={`Choose ${candidate} jar color`} onPress={() => { feedback.tap(); setAccent(candidate); }} style={({ pressed }) => [styles.color, { backgroundColor: jarAccent[candidate] }, accent === candidate && styles.colorSelected, pressed && styles.pressed]}>
                  {accent === candidate ? <MaterialIcons name="check" color="#FFFDF9" size={18} /> : null}
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Text style={styles.title}>Set its target.</Text>
            <Text style={styles.sub}>The jar fills toward this amount. A deadline is optional.</Text>
            <Text style={styles.label}>SET A TARGET</Text>
            <View style={styles.amountField}>
              <Text style={styles.currency}>$</Text>
              <TextInput autoFocus value={target} onChangeText={(raw) => setTarget(sanitizeAmountInput(raw))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.muted} style={styles.amountInput} />
            </View>
            <Text style={styles.label}>DEADLINE <Text style={styles.optional}>OPTIONAL</Text></Text>
            <View style={styles.deadlineField}>
              <MaterialIcons name="calendar-today" size={18} color={colors.muted} />
              <TextInput value={deadline} onChangeText={setDeadline} placeholder="e.g. December 2026" placeholderTextColor={colors.muted} style={styles.deadlineInput} />
            </View>
            <Text style={styles.disclaimer}>Saving Jar records your progress. It never moves your money.</Text>
          </>
        ) : null}

        <Pressable disabled={!stepValid} onPress={next} style={({ pressed }) => [styles.create, !stepValid && styles.disabled, pressed && stepValid && styles.pressed]}>
          <Text style={styles.createText}>{step === 3 ? "Create my jar" : "Continue"}</Text>
          <MaterialIcons name={step === 3 ? "arrow-forward" : "arrow-downward"} color="#FFFDF9" size={19} />
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

const makeStyles = (c: ThemeColorPalette) => StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 38 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border, borderRadius: 15, backgroundColor: c.surface },
  navTitle: { color: c.muted, fontSize: 10, letterSpacing: 1.35, fontWeight: "800" },
  stepDots: { flexDirection: "row", gap: 5, alignItems: "center" },
  stepDot: { width: 7, height: 7, borderRadius: 999, backgroundColor: c.border },
  title: { color: c.foreground, fontFamily: "Georgia", fontSize: 29, lineHeight: 34, marginTop: 23 },
  sub: { color: c.muted, fontSize: 13, lineHeight: 19, marginTop: 9, maxWidth: 310 },
  preview: { backgroundColor: c.surface, borderRadius: 25, borderWidth: 1, borderColor: c.border, flexDirection: "row", marginTop: 20, padding: 14, alignItems: "center", gap: 16 },
  previewCopy: { flex: 1 },
  previewLabel: { color: c.muted, fontWeight: "800", fontSize: 10, letterSpacing: 1.1 },
  previewName: { color: c.foreground, fontFamily: "Georgia", fontSize: 21, marginTop: 6 },
  previewTarget: { color: c.muted, fontSize: 12, marginTop: 6, lineHeight: 17 },
  label: { color: c.muted, marginTop: 25, fontWeight: "800", letterSpacing: 1.05, fontSize: 10 },
  optional: { fontWeight: "600", opacity: .75 },
  kindRow: { flexDirection: "row", gap: 9, marginTop: 9 },
  kind: { flex: 1, minHeight: 67, padding: 12, borderRadius: 17, borderColor: c.border, borderWidth: 1, backgroundColor: c.surface, flexDirection: "row", alignItems: "center", gap: 9 },
  kindActive: { backgroundColor: c.primary, borderColor: c.primary },
  kindTitle: { color: c.foreground, fontWeight: "800", fontSize: 13 },
  kindTitleActive: { color: "#FFFDF9" },
  kindNote: { color: c.muted, fontSize: 11, marginTop: 2 },
  kindNoteActive: { color: "#E8D9C8" },
  input: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, color: c.foreground, minHeight: 54, paddingHorizontal: 15, fontSize: 16, marginTop: 9 },
  iconRow: { flexDirection: "row", gap: 8, marginTop: 9 },
  iconChoice: { flex: 1, height: 43, borderRadius: 14, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", backgroundColor: c.surface },
  iconChoiceActive: { borderWidth: 1.5 },
  colors: { flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap" },
  color: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  colorSelected: { borderWidth: 3, borderColor: c.surface, shadowColor: "#4A3324", shadowOpacity: .2, shadowOffset: { width: 0, height: 2 }, shadowRadius: 5, elevation: 3 },
  amountField: { minHeight: 62, marginTop: 9, borderRadius: 17, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8 },
  currency: { color: c.primary, fontSize: 24, fontFamily: "Georgia" },
  amountInput: { flex: 1, color: c.foreground, fontSize: 26, fontFamily: "Georgia", fontVariant: ["tabular-nums"] },
  deadlineField: { minHeight: 52, marginTop: 9, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 },
  deadlineInput: { flex: 1, color: c.foreground, fontSize: 14 },
  disclaimer: { color: c.muted, fontSize: 11, lineHeight: 16, marginTop: 18 },
  create: { backgroundColor: c.primary, minHeight: 54, borderRadius: 17, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 26 },
  createText: { color: "#FFFDF9", fontSize: 15, fontWeight: "800" },
  disabled: { opacity: .45 },
  pressed: { opacity: .86, transform: [{ scale: .98 }] },
});
