import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { makeStyles } from "@/components/new-jar.styles";
import { JarVessel } from "@/components/jar-vessel";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { feedback } from "@/lib/haptics";
import { useJarAccents } from "@/hooks/use-jar-accents";
import { SUPPORTED_CURRENCIES, useSettings } from "@/lib/settings-store";
import {
  jarAccent,
  type Accent,
  type JarKind,
  sanitizeAmountInput,
  toMinor,
  useMoney,
  useSavings,
} from "@/lib/savings-store";

const accents: Accent[] = ["coral", "amber", "mint", "ocean", "berry", "clay"];
const icons = [
  "flight",
  "favorite",
  "laptop-mac",
  "home",
  "restaurant",
  "celebration",
];

/**
 * Guided first-jar creation: a moment,
 * not a form. Recurring deposits are introduced after the jar exists.
 */
export default function NewJar() {
  const colors = useColors();
  const accentsForScheme = useJarAccents();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { addJar } = useSavings();
  const { currency } = useSettings();
  const format = useMoney();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [accent, setAccent] = useState<Accent>("ocean");
  const [icon, setIcon] = useState("flight");
  const [kind, setKind] = useState<JarKind>("goal");
  const [deadline, setDeadline] = useState("");
  // Money is stored as integer minor units; inputs are sanitized as typed.
  const targetValue = toMinor(target);
  const currencySymbol =
    SUPPORTED_CURRENCIES.find((item) => item.code === currency)?.symbol ??
    currency;
  const accentHex = accentsForScheme[accent];
  const stepValid =
    step === 1
      ? Boolean(name.trim())
      : step < 3 || (targetValue !== null && targetValue > 0);

  const goBack = () => {
    if (step === 1) return router.back();
    feedback.tap();
    setStep(step - 1);
  };
  const next = () => {
    if (!stepValid) return;
    feedback.tap();
    if (step < 3) return setStep(step + 1);

    const id = addJar({
      name: name.trim(),
      target: targetValue!,
      accent,
      icon,
      kind,
      deadline: deadline.trim() || undefined,
      streak: kind === "habit" ? 0 : undefined,
    });
    router.replace(`/jar/${id}` as never);
  };

  const previewName = name.trim() || "A goal to grow";
  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          <Pressable
            accessibilityLabel={step === 1 ? "Go back" : "Previous step"}
            onPress={goBack}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <MaterialIcons
              name="arrow-back"
              color={colors.foreground}
              size={20}
            />
          </Pressable>
          <Text style={styles.navTitle}>NEW JAR</Text>
          <View style={styles.stepDots}>
            {[1, 2, 3].map((dot) => (
              <View
                key={dot}
                style={[
                  styles.stepDot,
                  dot <= step && { backgroundColor: accentHex },
                ]}
              />
            ))}
          </View>
        </View>

        <View style={styles.preview}>
          <JarVessel
            accent={accentHex}
            icon={icon}
            progress={0}
            size="medium"
            label="0%"
          />
          <View style={styles.previewCopy}>
            <Text style={styles.previewLabel}>YOUR NEW JAR</Text>
            <Text style={styles.previewName}>{previewName}</Text>
            <Text style={styles.previewTarget}>
              {targetValue && targetValue > 0
                ? `Target ${format(targetValue)}`
                : kind === "goal"
                  ? "Give it somewhere to grow."
                  : "Build a saving rhythm."}
            </Text>
          </View>
        </View>

        {step === 1 ? (
          <>
            <Text style={styles.title}>What are you{"\n"}saving for?</Text>
            <Text style={styles.sub}>
              Start with the goal itself. You can shape everything else after.
            </Text>
            <Text style={styles.label}>WHAT KIND OF JAR?</Text>
            <View style={styles.kindRow}>
              <Pressable
                onPress={() => {
                  feedback.tap();
                  setKind("goal");
                }}
                style={({ pressed }) => [
                  styles.kind,
                  kind === "goal" && styles.kindActive,
                  pressed && styles.pressed,
                ]}
              >
                <MaterialIcons
                  name="flag"
                  size={18}
                  color={kind === "goal" ? "#FFFDF9" : colors.muted}
                />
                <View>
                  <Text
                    style={[
                      styles.kindTitle,
                      kind === "goal" && styles.kindTitleActive,
                    ]}
                  >
                    Goal
                  </Text>
                  <Text
                    style={[
                      styles.kindNote,
                      kind === "goal" && styles.kindNoteActive,
                    ]}
                  >
                    A defined target
                  </Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => {
                  feedback.tap();
                  setKind("habit");
                }}
                style={({ pressed }) => [
                  styles.kind,
                  kind === "habit" && styles.kindActive,
                  pressed && styles.pressed,
                ]}
              >
                <MaterialIcons
                  name="repeat"
                  size={18}
                  color={kind === "habit" ? "#FFFDF9" : colors.muted}
                />
                <View>
                  <Text
                    style={[
                      styles.kindTitle,
                      kind === "habit" && styles.kindTitleActive,
                    ]}
                  >
                    Habit
                  </Text>
                  <Text
                    style={[
                      styles.kindNote,
                      kind === "habit" && styles.kindNoteActive,
                    ]}
                  >
                    Build a rhythm
                  </Text>
                </View>
              </Pressable>
            </View>
            <Text style={styles.label}>NAME YOUR JAR</Text>
            <TextInput
              accessibilityLabel="Jar name"
              accessibilityHint="Enter what you are saving for."
              autoFocus
              value={name}
              onChangeText={setName}
              placeholder="e.g. Japan trip"
              placeholderTextColor={colors.muted}
              maxLength={60}
              returnKeyType="next"
              onSubmitEditing={next}
              style={styles.input}
            />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={styles.title}>Give it some{"\n"}personality.</Text>
            <Text style={styles.sub}>
              Pick an icon and a colour. This jar is yours.
            </Text>
            <Text style={styles.label}>CHOOSE AN ICON</Text>
            <View style={styles.iconRow}>
              {icons.map((candidate) => (
                <Pressable
                  key={candidate}
                  accessibilityLabel={`Choose ${candidate} icon`}
                  onPress={() => {
                    feedback.tap();
                    setIcon(candidate);
                  }}
                  style={({ pressed }) => [
                    styles.iconChoice,
                    icon === candidate && [
                      styles.iconChoiceActive,
                      {
                        backgroundColor: `${accentHex}22`,
                        borderColor: accentHex,
                      },
                    ],
                    pressed && styles.pressed,
                  ]}
                >
                  <MaterialIcons
                    name={candidate as never}
                    size={21}
                    color={icon === candidate ? accentHex : colors.muted}
                  />
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>CHOOSE A JAR COLOUR</Text>
            <View style={styles.colors}>
              {accents.map((candidate) => (
                <Pressable
                  key={candidate}
                  accessibilityLabel={`Choose ${candidate} jar color`}
                  onPress={() => {
                    feedback.tap();
                    setAccent(candidate);
                  }}
                  style={({ pressed }) => [
                    styles.color,
                    { backgroundColor: jarAccent[candidate] },
                    accent === candidate && styles.colorSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  {accent === candidate ? (
                    <MaterialIcons name="check" color="#FFFDF9" size={18} />
                  ) : null}
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Text style={styles.title}>Set its target.</Text>
            <Text style={styles.sub}>
              The jar fills toward this amount. A deadline is optional.
            </Text>
            <Text style={styles.label}>SET A TARGET</Text>
            <View style={styles.amountField}>
              <Text style={styles.currency}>{currencySymbol}</Text>
              <TextInput
                accessibilityLabel="Savings target"
                accessibilityHint={`Enter a positive target in ${currency}.`}
                autoFocus
                value={target}
                onChangeText={(raw) => setTarget(sanitizeAmountInput(raw))}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.muted}
                style={styles.amountInput}
              />
            </View>
            {!stepValid ? (
              <Text accessibilityRole="alert" style={styles.disclaimer}>
                Enter a target greater than zero.
              </Text>
            ) : null}
            <Text style={styles.label}>
              DEADLINE <Text style={styles.optional}>OPTIONAL</Text>
            </Text>
            <View style={styles.deadlineField}>
              <MaterialIcons
                name="calendar-today"
                size={18}
                color={colors.muted}
              />
              <TextInput
                accessibilityLabel="Deadline"
                accessibilityHint="Optional. Enter a date or month and year."
                value={deadline}
                onChangeText={setDeadline}
                placeholder="e.g. December 2026"
                placeholderTextColor={colors.muted}
                style={styles.deadlineInput}
              />
            </View>
            <Text style={styles.disclaimer}>
              Saving Jar records your progress. It never moves your money.
            </Text>
          </>
        ) : null}

        <Pressable
          disabled={!stepValid}
          onPress={next}
          style={({ pressed }) => [
            styles.create,
            !stepValid && styles.disabled,
            pressed && stepValid && styles.pressed,
          ]}
        >
          <Text style={styles.createText}>
            {step === 3 ? "Create my jar" : "Continue"}
          </Text>
          <MaterialIcons
            name={step === 3 ? "arrow-forward" : "arrow-downward"}
            color="#FFFDF9"
            size={19}
          />
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}
