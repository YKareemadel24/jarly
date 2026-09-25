import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";

import { makeStyles } from "@/app/jar/jar-detail.styles";
import { useColors } from "@/hooks/use-colors";
import {
  type QuickPreset,
  sanitizeAmountInput,
  toMinor,
} from "@/lib/savings-store";

type Props = {
  direction: "deposit" | "withdrawal" | null;
  jarName: string;
  jarBalance: number;
  currencySymbol: string;
  amount: string;
  note: string;
  error: string;
  presets: QuickPreset[];
  accent: string;
  withdrawPreview: number | null;
  depositPreview: number | null;
  depositPreviewPct: number | null;
  format: (minor: number) => string;
  onAmountChange: (raw: string) => void;
  onNoteChange: (note: string) => void;
  onApplyPreset: (minor: number) => void;
  onRecord: () => void;
  onDismiss: () => void;
};

export function DepositSheet({
  direction,
  jarName,
  jarBalance,
  currencySymbol,
  amount,
  note,
  error,
  presets,
  accent,
  withdrawPreview,
  depositPreview,
  depositPreviewPct,
  format,
  onAmountChange,
  onNoteChange,
  onApplyPreset,
  onRecord,
  onDismiss,
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal
      transparent
      animationType="slide"
      visible={Boolean(direction)}
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetEyebrow}>
            {direction === "deposit" ? "ADD TO JAR" : "TAKE MONEY OUT"}
          </Text>
          <Text style={styles.sheetTitle}>
            {direction === "deposit"
              ? "Every bit adds up."
              : "Use what you need."}
          </Text>
          <Text style={styles.sheetCopy}>
            {direction === "deposit"
              ? `Add to ${jarName} and watch the jar rise.`
              : `This jar currently holds ${format(jarBalance)}.`}
          </Text>
          {direction === "deposit" && presets.length ? (
            <View style={styles.chipRow}>
              {presets.map((preset) => {
                const activeChip =
                  amount !== "" &&
                  toMinor(sanitizeAmountInput(amount)) === preset.amount;
                return (
                  <Pressable
                    key={preset.id}
                    accessibilityLabel={`${preset.label}. ${preset.hint}. Adds ${format(preset.amount)}.`}
                    onPress={() => onApplyPreset(preset.amount)}
                    style={({ pressed }) => [
                      styles.chip,
                      activeChip && [
                        styles.chipActive,
                        {
                          backgroundColor: `${accent}22`,
                          borderColor: accent,
                        },
                      ],
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[styles.chipText, activeChip && { color: accent }]}
                    >
                      {preset.label}
                    </Text>
                    <Text
                      style={[styles.chipHint, activeChip && { color: accent }]}
                    >
                      {preset.hint}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <View style={styles.sheetAmount}>
            <Text style={styles.sheetCurrency}>{currencySymbol}</Text>
            <TextInput
              autoFocus
              accessibilityLabel="Amount"
              value={amount}
              onChangeText={onAmountChange}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.muted}
              style={styles.sheetAmountInput}
            />
          </View>
          {withdrawPreview !== null && !Number.isNaN(withdrawPreview) ? (
            <Text style={styles.previewBalance}>
              Leaves {format(withdrawPreview)} in this jar.
            </Text>
          ) : null}
          {depositPreview !== null && depositPreviewPct !== null ? (
            <View style={styles.previewRow}>
              <Text style={styles.previewBalance}>{format(jarBalance)}</Text>
              <MaterialIcons
                name="arrow-forward"
                size={13}
                color={colors.muted}
              />
              <Text style={styles.previewNewBalance}>
                {format(depositPreview)}
              </Text>
              <Text style={[styles.previewPct, { color: accent }]}>
                {depositPreviewPct}%
              </Text>
            </View>
          ) : null}
          <TextInput
            value={note}
            onChangeText={onNoteChange}
            maxLength={80}
            placeholder="Add a note (optional)"
            placeholderTextColor={colors.muted}
            style={styles.noteInput}
          />
          <Text style={styles.error}>{error}</Text>
          <Pressable
            onPress={onRecord}
            style={({ pressed }) => [
              styles.sheetButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.sheetButtonText}>
              {direction === "deposit" ? "Add to jar" : "Confirm withdrawal"}
            </Text>
          </Pressable>
          <Pressable onPress={onDismiss} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
