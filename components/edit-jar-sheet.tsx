import { useMemo } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";

import { makeStyles } from "@/app/jar/jar-detail.styles";
import { useColors } from "@/hooks/use-colors";
import { type JarKind } from "@/lib/savings-store";

type Props = {
  visible: boolean;
  name: string;
  target: string;
  kind: JarKind;
  error: string;
  currencySymbol: string;
  accent: string;
  onNameChange: (name: string) => void;
  onTargetChange: (raw: string) => void;
  onKindChange: (kind: JarKind) => void;
  onSave: () => void;
  onDismiss: () => void;
};

export function EditJarSheet({
  visible,
  name,
  target,
  kind,
  error,
  currencySymbol,
  accent,
  onNameChange,
  onTargetChange,
  onKindChange,
  onSave,
  onDismiss,
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetEyebrow}>EDIT JAR</Text>
          <Text style={styles.sheetTitle}>Adjust your goal.</Text>
          <Text style={styles.sheetCopy}>
            Rename it or change its target. Your history stays untouched.
          </Text>
          <TextInput
            accessibilityLabel="Jar name"
            value={name}
            onChangeText={onNameChange}
            maxLength={60}
            placeholder="Jar name"
            placeholderTextColor={colors.muted}
            style={styles.noteInput}
          />
          <View style={[styles.sheetAmount, { marginTop: 10 }]}>
            <Text style={styles.sheetCurrency}>{currencySymbol}</Text>
            <TextInput
              accessibilityLabel="Target amount"
              value={target}
              onChangeText={onTargetChange}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.muted}
              style={styles.sheetAmountInput}
            />
          </View>
          <View style={styles.cadences}>
            {(["goal", "habit"] as JarKind[]).map((item) => (
              <Pressable
                key={item}
                accessibilityLabel={`${item} jar`}
                onPress={() => onKindChange(item)}
                style={[
                  styles.cadence,
                  kind === item && {
                    backgroundColor: accent,
                    borderColor: accent,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.cadenceText,
                    kind === item && styles.cadenceTextActive,
                  ]}
                >
                  {item === "goal" ? "Goal" : "Habit"}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.error}>{error}</Text>
          <Pressable
            onPress={onSave}
            style={({ pressed }) => [
              styles.sheetButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.sheetButtonText}>Save changes</Text>
          </Pressable>
          <Pressable onPress={onDismiss} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
