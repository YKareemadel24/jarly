import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { makeStyles } from "@/components/edit-entry.styles";
import { useColors } from "@/hooks/use-colors";
import {
  fromMinor,
  parseDeadline,
  sanitizeAmountInput,
  toMinor,
  type Entry,
  type EntryCorrection,
} from "@/lib/savings-core";
import { useMoney } from "@/lib/savings-store";

function localDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function EditEntrySheet({
  entry,
  canEdit,
  onSave,
  onUndo,
  onDismiss,
}: {
  entry: Entry;
  canEdit: boolean;
  onSave: (input: EntryCorrection) => boolean;
  onUndo: () => boolean;
  onDismiss: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const format = useMoney();
  const [amount, setAmount] = useState(fromMinor(entry.amount).toFixed(2));
  const [date, setDate] = useState(localDate(entry.at));
  const [note, setNote] = useState(entry.note ?? "");
  const [error, setError] = useState("");
  const save = () => {
    const minor = toMinor(amount);
    const chosenDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? parseDeadline(date)
      : undefined;
    if (!minor || minor <= 0 || !chosenDate) {
      setError("Enter a positive amount and a valid date (YYYY-MM-DD).");
      return;
    }
    const at =
      date === localDate(entry.at) ? entry.at : chosenDate.toISOString();
    if (!onSave({ amount: minor, at, note: note.trim() || undefined }))
      setError(
        "This change cannot be saved. Check the date and balance; earlier withdrawals must remain funded.",
      );
  };
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onDismiss}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={styles.sheet}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text accessibilityRole="header" style={styles.title}>
            Transaction details
          </Text>
          <Text style={styles.copy}>
            {entry.undoOf
              ? "This is an Undo record."
              : canEdit
                ? "Correct the amount, date, or note. Previous values stay in the history."
                : "This transaction has been undone. Its original record is kept below."}
          </Text>
          <Text style={styles.label}>Amount</Text>
          <TextInput
            accessibilityLabel="Corrected amount"
            editable={canEdit}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={(raw) => setAmount(sanitizeAmountInput(raw))}
            style={styles.input}
          />
          <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
          <TextInput
            accessibilityLabel="Transaction date"
            editable={canEdit}
            value={date}
            onChangeText={setDate}
            maxLength={10}
            autoCapitalize="none"
            style={styles.input}
          />
          <Text style={styles.label}>Note</Text>
          <TextInput
            accessibilityLabel="Transaction note"
            editable={canEdit}
            value={note}
            onChangeText={setNote}
            maxLength={500}
            multiline
            style={styles.input}
          />
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
          {canEdit ? (
            <>
              <Pressable
                accessibilityRole="button"
                onPress={save}
                style={styles.primary}
              >
                <Text style={styles.primaryText}>Save correction</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (!onUndo())
                    setError(
                      "Undo is unavailable because this balance has changed or the transaction was already undone.",
                    );
                }}
                style={styles.secondary}
              >
                <Text style={styles.secondaryText}>
                  Undo this {entry.direction}
                </Text>
              </Pressable>
            </>
          ) : null}
          {entry.revisions?.length ? (
            <View style={styles.history}>
              <Text style={styles.label}>Previous values</Text>
              {[...entry.revisions].reverse().map((revision, index) => (
                <View key={index} style={styles.revision}>
                  <Text style={styles.copy}>
                    {format(revision.amount)} ·{" "}
                    {new Date(revision.at).toLocaleDateString()}
                  </Text>
                  {revision.note ? (
                    <Text style={styles.copy}>{revision.note}</Text>
                  ) : null}
                  <Text style={styles.copy}>
                    Corrected {new Date(revision.changedAt).toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={onDismiss}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>Close</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
