import { useMemo } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";

import { makeStyles } from "@/components/jar-detail.styles";
import { useColors } from "@/hooks/use-colors";
import { CADENCES, type Cadence } from "@/lib/savings-store";

type Props = {
  visible: boolean;
  currentAmountMinor: number | undefined;
  currentPaused: boolean;
  amount: string;
  cadence: Cadence;
  error: string;
  currencySymbol: string;
  accent: string;
  onAmountChange: (raw: string) => void;
  onCadenceChange: (cadence: Cadence) => void;
  onSave: () => void;
  onTogglePause: () => void;
  onDismiss: () => void;
};

export function RecurringSheet({
  visible,
  currentAmountMinor,
  currentPaused,
  amount,
  cadence,
  error,
  currencySymbol,
  accent,
  onAmountChange,
  onCadenceChange,
  onSave,
  onTogglePause,
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
          <Text style={styles.sheetEyebrow}>REPEAT CONTRIBUTION</Text>
          <Text style={styles.sheetTitle}>Build the habit.</Text>
          <Text style={styles.sheetCopy}>
            Choose a contribution you can repeat comfortably.
          </Text>
          <View style={styles.sheetAmount}>
            <Text style={styles.sheetCurrency}>{currencySymbol}</Text>
            <TextInput
              autoFocus
              accessibilityLabel="Recurring amount"
              value={amount}
              onChangeText={onAmountChange}
              keyboardType="decimal-pad"
              placeholder={
                currentAmountMinor === undefined
                  ? "0"
                  : String(currentAmountMinor / 100)
              }
              placeholderTextColor={colors.muted}
              style={styles.sheetAmountInput}
            />
          </View>
          <View style={styles.cadences}>
            {CADENCES.map((item) => (
              <Pressable
                key={item}
                accessibilityLabel={`Every ${item}`}
                onPress={() => onCadenceChange(item)}
                style={[
                  styles.cadence,
                  cadence === item && {
                    backgroundColor: accent,
                    borderColor: accent,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.cadenceText,
                    cadence === item && styles.cadenceTextActive,
                  ]}
                >
                  {item}
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
            <Text style={styles.sheetButtonText}>Save schedule</Text>
          </Pressable>
          {currentAmountMinor !== undefined ? (
            <Pressable onPress={onTogglePause} style={styles.cancel}>
              <Text style={styles.pauseText}>
                {currentPaused ? "Resume schedule" : "Pause schedule"}
              </Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onDismiss} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
