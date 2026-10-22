import type { Jar } from "@/lib/domain";
import { mergeTransferJars } from "@/lib/transfer-merge";
import {
  decodeTransferFrames,
  MAX_TRANSFER_FRAMES,
  MAX_TRANSFER_FRAME_LENGTH,
  type TransferSnapshot,
} from "@/shared/transfer";

export const MAX_BACKUP_BYTES = 512 * 1024;

export type Backup = {
  frames: string[];
  snapshot: TransferSnapshot & { currency: string };
  summary: {
    jars: number;
    entries: number;
    archived: number;
    totalMinor: string;
  };
};

export function parseBackup(text: string): Backup {
  if (text.length > MAX_BACKUP_BYTES)
    throw new Error("This backup is too large. Choose a file under 512 KB.");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("This file is not a readable Saving Jar backup.");
  }
  if (!value || typeof value !== "object")
    throw new Error("This file is not a Saving Jar backup.");
  const data = value as Record<string, unknown>;
  if (data.format !== "jarly-backup" || data.version !== 1)
    throw new Error(
      "This backup format is not supported. It may need a newer app.",
    );
  if (
    !Array.isArray(data.frames) ||
    data.frames.length === 0 ||
    data.frames.length > MAX_TRANSFER_FRAMES ||
    data.frames.some(
      (frame) =>
        typeof frame !== "string" || frame.length > MAX_TRANSFER_FRAME_LENGTH,
    )
  )
    throw new Error("This backup contains invalid or excessive transfer data.");
  const frames = data.frames as string[];
  const assembly = decodeTransferFrames(frames);
  if (assembly?.error) throw new Error(assembly.error);
  if (!assembly?.snapshot)
    throw new Error("This backup is incomplete or damaged.");
  if (assembly.have.length + assembly.duplicates !== frames.length)
    throw new Error("This backup contains damaged transfer data.");
  const snapshot = assembly.snapshot;
  if (!snapshot.currency)
    throw new Error("This backup does not identify its currency.");
  const validated = mergeTransferJars(
    [],
    snapshot.jars,
    snapshot.currency,
    snapshot.currency,
  );
  if (validated.error) throw new Error(validated.error);
  return {
    frames,
    snapshot: { ...snapshot, currency: snapshot.currency },
    summary: {
      jars: snapshot.jars.length,
      entries: snapshot.jars.reduce(
        (total, jar) => total + jar.entries.length,
        0,
      ),
      archived: snapshot.jars.filter((jar) => jar.archived).length,
      totalMinor: snapshot.jars
        .reduce((total, jar) => total + BigInt(jar.balance), BigInt(0))
        .toString(),
    },
  };
}

export function createBackup(frames: string[]): string {
  const text = JSON.stringify({ format: "jarly-backup", version: 1, frames });
  parseBackup(text);
  return text;
}

export function previewBackup(
  backup: Backup,
  current: Jar[],
  currency: string,
) {
  return mergeTransferJars(
    current,
    backup.snapshot.jars,
    backup.snapshot.currency,
    currency,
  );
}
