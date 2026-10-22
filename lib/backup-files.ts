import { Platform } from "react-native";

import { MAX_BACKUP_BYTES } from "@/lib/backup";

function checkSize(size: number) {
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_BACKUP_BYTES)
    throw new Error("Choose a nonempty Saving Jar backup under 512 KB.");
}

export async function saveBackupFile(text: string): Promise<void> {
  const filename = `saving-jar-${new Date().toISOString().replace(/[:.]/g, "-")}.jarly`;
  if (Platform.OS === "web") {
    const blob = new Blob([text], { type: "application/json" });
    checkSize(blob.size);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const [{ File, Paths }, sharing] = await Promise.all([
    import("expo-file-system"),
    import("expo-sharing"),
  ]);
  if (!(await sharing.isAvailableAsync()))
    throw new Error("File sharing is unavailable on this device.");
  const file = new File(Paths.cache, filename);
  file.create();
  file.write(text);
  await sharing.shareAsync(file.uri, {
    mimeType: "application/json",
    UTI: "public.json",
    dialogTitle: "Save your Saving Jar backup",
  });
}

export function pickBackupFile(): Promise<string | null> {
  if (Platform.OS === "web") {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".jarly,application/json";
      input.style.display = "none";
      input.addEventListener(
        "cancel",
        () => {
          input.remove();
          resolve(null);
        },
        { once: true },
      );
      input.addEventListener(
        "change",
        () => {
          const file = input.files?.[0];
          input.remove();
          if (!file) {
            resolve(null);
            return;
          }
          try {
            checkSize(file.size);
          } catch (error) {
            reject(error);
            return;
          }
          void file.text().then(resolve, reject);
        },
        { once: true },
      );
      document.body.appendChild(input);
      input.click();
    });
  }
  return pickNativeBackup();
}

async function pickNativeBackup(): Promise<string | null> {
  const picker = await import("expo-document-picker");
  const result = await picker.getDocumentAsync({
    type: "*/*",
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const { File } = await import("expo-file-system");
  const asset = result.assets[0];
  if (!asset) throw new Error("No backup file was selected.");
  const file = new File(asset.uri);
  checkSize(asset.size ?? file.size);
  checkSize(file.size);
  return file.text();
}
