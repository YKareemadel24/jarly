import { normaliseJar, type Jar } from "@/lib/domain";

export type KeyValueStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

const KEY = "saving-jar:v3";
const BACKUP_KEY = "saving-jar:v3:backup";
const LEGACY_KEYS = ["saving-jar:v2", "saving-jar:v1"] as const;

function parseJars(raw: string | null, legacy = false): Jar[] | undefined {
  if (raw === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    if (
      parsed.some(
        (item) =>
          !item || typeof item !== "object" || typeof item.id !== "string",
      )
    )
      return undefined;
    const jars = parsed.map((jar) => normaliseJar(jar, legacy));
    if (jars.some((jar) => !validStoredJar(jar))) return undefined;
    const activeTotal = jars
      .filter((jar) => !jar.archived)
      .reduce((total, jar) => total + jar.balance, 0);
    if (!Number.isSafeInteger(activeTotal)) return undefined;
    return jars;
  } catch {
    return undefined;
  }
}

function validStoredJar(jar: Jar): boolean {
  return (
    Number.isSafeInteger(jar.target) &&
    jar.target > 0 &&
    Number.isSafeInteger(jar.balance) &&
    jar.balance >= 0 &&
    Array.isArray(jar.entries) &&
    jar.entries.every(
      (entry) =>
        Number.isSafeInteger(entry.amount) &&
        entry.amount > 0 &&
        (entry.direction === "deposit" || entry.direction === "withdrawal") &&
        typeof entry.at === "string" &&
        !Number.isNaN(Date.parse(entry.at)),
    ) &&
    (!jar.recurring ||
      (Number.isSafeInteger(jar.recurring.amount) && jar.recurring.amount > 0))
  );
}

export async function loadPersistedJars(
  storage: KeyValueStorage,
): Promise<{ jars: Jar[]; writable: boolean }> {
  const currentRaw = await storage.getItem(KEY);
  const current = parseJars(currentRaw);
  if (current) return { jars: current, writable: true };

  const backup = parseJars(await storage.getItem(BACKUP_KEY));
  if (backup) return { jars: backup, writable: true };

  for (const key of LEGACY_KEYS) {
    const legacy = parseJars(await storage.getItem(key), true);
    if (legacy?.length) return { jars: legacy, writable: true };
  }

  // Keep corrupt current data available for manual recovery instead of replacing it.
  return { jars: [], writable: currentRaw === null };
}

let writeQueue = Promise.resolve();

export function persistJars(
  storage: KeyValueStorage,
  jars: Jar[],
): Promise<void> {
  const write = writeQueue.then(async () => {
    const previous = await storage.getItem(KEY);
    if (parseJars(previous) && previous !== null)
      await storage.setItem(BACKUP_KEY, previous);
    await storage.setItem(KEY, JSON.stringify(jars));
  });
  writeQueue = write.catch(() => undefined);
  return write;
}
