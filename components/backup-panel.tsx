import { useMemo, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { makeStyles } from "@/components/backup.styles";
import { useColors } from "@/hooks/use-colors";
import {
  createBackup,
  parseBackup,
  previewBackup,
  type Backup,
} from "@/lib/backup";
import { pickBackupFile, saveBackupFile } from "@/lib/backup-files";
import { useSavings } from "@/lib/savings-store";
import { useSettings } from "@/lib/settings-store";

export function BackupPanel() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { currency } = useSettings();
  const { jars, ready, storageError, exportTransfer, importTransfer } =
    useSavings();
  const [backup, setBackup] = useState<Backup | null>(null);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preview = useMemo(
    () => (backup ? previewBackup(backup, jars, currency) : null),
    [backup, jars, currency],
  );
  const disabled = busy || !ready || Boolean(storageError);

  async function run(action: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not complete the backup action. Try again.",
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  const restore = () => {
    if (!backup || disabled || preview?.error) return;
    void run(async () => {
      // The store validates again against fresh jars, including changes since preview.
      const result = importTransfer(backup.frames, currency);
      if (result.error) throw new Error(result.error);
      setNotice(
        `Restored ${result.added} new and ${result.updated} updated jars; ${result.skipped} unchanged. Existing jars were kept.`,
      );
      setBackup(null);
    });
  };

  return (
    <>
      <Text style={styles.label}>FILE BACKUP</Text>
      <View style={styles.card}>
        <Text style={styles.title}>Keep a copy of your savings</Text>
        <Text style={styles.copy}>
          Save a .jarly file with every jar and its history, including completed
          and archived jars. PINs and app settings are excluded. The file
          contains readable savings data; keep it somewhere private.
        </Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            accessibilityState={{ disabled }}
            style={({ pressed }) => [
              styles.button,
              disabled && styles.disabled,
              pressed && styles.pressed,
            ]}
            onPress={() =>
              void run(async () => {
                await saveBackupFile(createBackup(exportTransfer(currency)));
                setNotice(
                  Platform.OS === "web"
                    ? "Backup download requested. Check your browser downloads."
                    : "Backup share sheet closed. A copy is saved only if you chose a destination.",
                );
              })
            }
          >
            <Text style={styles.buttonText}>Export backup</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            accessibilityState={{ disabled }}
            style={({ pressed }) => [
              styles.button,
              disabled && styles.disabled,
              pressed && styles.pressed,
            ]}
            onPress={() =>
              void run(async () => {
                setBackup(null);
                const text = await pickBackupFile();
                if (text !== null) setBackup(parseBackup(text));
              })
            }
          >
            <Text style={styles.buttonText}>Choose backup file</Text>
          </Pressable>
        </View>
        {storageError ? (
          <Text style={styles.error}>
            Backups are unavailable until local storage can be read safely:{" "}
            {storageError}
          </Text>
        ) : null}
        {busy ? <Text style={styles.copy}>Working…</Text> : null}
        {backup && preview ? (
          <View style={styles.preview}>
            <Text style={styles.title}>Restore preview</Text>
            <Text style={styles.copy}>
              Exported {new Date(backup.snapshot.exportedAt).toLocaleString()}
            </Text>
            <Text style={styles.copy}>
              {backup.snapshot.currency} · {backup.summary.jars} jars ·{" "}
              {backup.summary.entries} entries · {backup.summary.archived}{" "}
              archived
            </Text>
            <Text style={styles.copy}>
              Total including archived: {backup.snapshot.currency}{" "}
              {`${BigInt(backup.summary.totalMinor) / BigInt(100)}.${(BigInt(backup.summary.totalMinor) % BigInt(100)).toString().padStart(2, "0")}`}
            </Text>
            {preview.error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {preview.error}
              </Text>
            ) : (
              <Text style={styles.copy}>
                {preview.added} new · {preview.updated} updated ·{" "}
                {preview.skipped} unchanged. Your other jars stay on this
                device.
              </Text>
            )}
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                disabled={disabled || Boolean(preview.error)}
                accessibilityState={{
                  disabled: disabled || Boolean(preview.error),
                }}
                onPress={restore}
                style={({ pressed }) => [
                  styles.button,
                  styles.primary,
                  (disabled || Boolean(preview.error)) && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.buttonText, styles.primaryText]}>
                  Restore backup
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => setBackup(null)}
                style={styles.button}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        {notice ? (
          <Text accessibilityLiveRegion="polite" style={styles.copy}>
            {notice}
          </Text>
        ) : null}
      </View>
    </>
  );
}
